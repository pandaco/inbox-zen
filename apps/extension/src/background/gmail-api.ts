import type { SenderStat, SizeStat, SubjectStat, StatsResult, GlobalStats } from '../shared/types';

export type { SenderStat, SizeStat, SubjectStat, StatsResult, GlobalStats };

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const BATCH_API = 'https://www.googleapis.com/batch/gmail/v1';
const BATCH_SIZE = 50;       // quota units per batch = 50 * 5 = 250 (max/s limit)
const BATCH_DELAY_MS = 1100; // slightly above 1s to stay within quota
const MAX_RETRIES = 4;

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface MessageListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
}

interface MessageMetadata {
  id: string;
  threadId?: string;
  sizeEstimate: number;
  payload?: { headers?: { name: string; value: string }[] };
}

function getHeader(msg: MessageMetadata, name: string): string {
  return (
    msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  );
}

function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: from, email: from };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function listAllMessageIds(token: string, query: string): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      maxResults: '500',
      fields: 'messages/id,nextPageToken',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await fetchJson<MessageListResponse>(
      `${GMAIL_API}/messages?${params}`,
      token,
    );

    data.messages?.forEach(m => ids.push(m.id));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return ids;
}

function parseBatchResponse(text: string, contentType: string): MessageMetadata[] {
  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
  if (!boundaryMatch) return [];
  const boundary = boundaryMatch[1];

  return text
    .split(`--${boundary}`)
    .slice(1, -1)
    .flatMap(part => {
      const jsonStart = part.indexOf('{');
      const jsonEnd = part.lastIndexOf('}');
      if (jsonStart === -1 || jsonEnd === -1) return [];
      try {
        const parsed = JSON.parse(part.slice(jsonStart, jsonEnd + 1)) as MessageMetadata;
        if (!parsed.id) return []; // skip error responses (e.g. 404 per-item failures)
        return [parsed];
      } catch {
        return [];
      }
    });
}

async function fetchMetadataBatch(
  token: string,
  ids: string[],
  metadataHeaders: string[],
): Promise<MessageMetadata[]> {
  const boundary = `batch_${Math.random().toString(36).slice(2)}`;
  const headerParams = metadataHeaders
    .map(h => `metadataHeaders=${encodeURIComponent(h)}`)
    .join('&');
  const fields = 'id,threadId,sizeEstimate,payload/headers';

  const body = ids
    .map(id => {
      return (
        `--${boundary}\r\n` +
        `Content-Type: application/http\r\n\r\n` +
        `GET ${GMAIL_API}/messages/${id}?format=metadata&${headerParams}&fields=${encodeURIComponent(fields)}\r\n`
      );
    })
    .join('') + `--${boundary}--\r\n`;

  const res = await fetch(BATCH_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) throw new Error(`Batch request failed: ${res.status}`);
  const text = await res.text();
  const contentType = res.headers.get('Content-Type') || '';
  return parseBatchResponse(text, contentType);
}

export type ProgressCallback = (fetched: number, total: number) => void;

async function fetchAllMetadata(
  token: string,
  ids: string[],
  metadataHeaders: string[],
  onProgress?: ProgressCallback,
): Promise<{ messages: MessageMetadata[]; errorCount: number }> {
  const messages: MessageMetadata[] = [];
  let errorCount = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    let retries = 0;
    let success = false;

    while (retries < MAX_RETRIES && !success) {
      try {
        const results = await fetchMetadataBatch(token, chunk, metadataHeaders);
        messages.push(...results);
        errorCount += chunk.length - results.length;
        success = true;
      } catch (err) {
        retries++;
        if (retries === MAX_RETRIES) throw err;
        await sleep(BATCH_DELAY_MS * retries);
      }
    }

    onProgress?.(messages.length, ids.length);
    if (i + BATCH_SIZE < ids.length) await sleep(BATCH_DELAY_MS);
  }

  return { messages, errorCount };
}

export async function getGlobalStats(
  token: string,
  onProgress?: ProgressCallback,
): Promise<GlobalStats> {
  const now = Date.now();
  
  // 1. Surgical parallel ID fetching, strictly restricted to INBOX
  // We fetch a bit more for old/heavy to be thorough, but we limit to avoid quota blast
  const [unreadIds, heavyIds, oldIds] = await Promise.all([
    listAllMessageIds(token, 'in:inbox is:unread'),
    listAllMessageIds(token, 'in:inbox (has:attachment OR larger:100kb)'),
    listAllMessageIds(token, 'in:inbox older_than:1y')
  ]);

  // 2. Mutualize IDs
  const allIds = Array.from(new Set([...unreadIds, ...heavyIds, ...oldIds]));
  
  // 3. One single crawl of metadata
  const { messages, errorCount } = await fetchAllMetadata(
    token, 
    allIds, 
    ['From', 'Subject', 'Date', 'List-Unsubscribe'], 
    onProgress
  );

  const msgMap = new Map(messages.map(m => [m.id, m]));

  // Helper to filter results
  const getSubSet = (ids: string[]) => ids.map(id => msgMap.get(id)).filter((m): m is MessageMetadata => !!m);

  const unreadMsgs = getSubSet(unreadIds);
  const heavyMsgs = getSubSet(heavyIds);
  const oldMsgs = getSubSet(oldIds);

  // --- Calculations ---

  // A. Unread Senders & Noise Score
  const senderCounts = new Map<string, { name: string; count: number; unsubscribeUrl?: string; firstDate: number; lastDate: number }>();
  for (const m of unreadMsgs) {
    const from = getHeader(m, 'From');
    if (!from) continue;
    const { name, email } = parseSender(from);
    if (!email) continue;
    const date = new Date(getHeader(m, 'Date') || now).getTime();
    const unsub = getHeader(m, 'List-Unsubscribe');
    const unsubUrl = unsub?.match(/<(https?:\/\/[^>]+)>/)?.[1];

    const existing = senderCounts.get(email);
    if (existing) {
      existing.count++;
      if (!existing.unsubscribeUrl) existing.unsubscribeUrl = unsubUrl;
      existing.firstDate = Math.min(existing.firstDate, date);
      existing.lastDate = Math.max(existing.lastDate, date);
    } else {
      senderCounts.set(email, { name, count: 1, unsubscribeUrl: unsubUrl, firstDate: date, lastDate: date });
    }
  }
  const unreadSenders = [...senderCounts.entries()]
    .map(([email, s]) => {
      const days = Math.max(1, (s.lastDate - s.firstDate) / 86400000);
      const score = (s.count / days) * ( (now - s.lastDate) < 604800000 ? 2 : 1) * Math.log10(s.count + 1);
      return { sender: s.name || email, email, count: s.count, unsubscribeUrl: s.unsubscribeUrl, score };
    })
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  // B. Heaviest
  const heaviestEmails = heavyMsgs
    .map(m => ({ subject: getHeader(m, 'Subject') || '(no subject)', from: getHeader(m, 'From'), sizeEstimate: m.sizeEstimate }))
    .sort((a, b) => b.sizeEstimate - a.sizeEstimate);

  // C. Repeated Subjects & Redundant Threads
  const subCounts = new Map<string, number>();
  const threadCounts = new Map<string, { subject: string; count: number }>();
  for (const m of unreadMsgs) {
    const subject = getHeader(m, 'Subject') || '(no subject)';
    subCounts.set(subject, (subCounts.get(subject) || 0) + 1);
    
    const threadId = m.threadId || m.id;
    const t = threadCounts.get(threadId);
    if (t) t.count++; else threadCounts.set(threadId, { subject, count: 1 });
  }
  const repeatedSubjects = [...subCounts.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count);
  const redundantThreads = [...threadCounts.values()].filter(t => t.count > 3).sort((a, b) => b.count - a.count);

  // D. OTP & Parcels & Old & Invites
  const expiredOTPs: SubjectStat[] = [];
  const parcelNotifications: SubjectStat[] = [];
  const oldEmails: SubjectStat[] = [];
  const pastInvites: SubjectStat[] = [];

  const otpRegex = /verification|OTP|one-time password|code/i;
  const parcelRegex = /shipping|delivery|colis|livraison|expédition/i;
  const inviteRegex = /invite\.ics/i;

  for (const m of messages) {
    const subject = getHeader(m, 'Subject') || '';
    const date = new Date(getHeader(m, 'Date') || now).getTime();

    if (otpRegex.test(subject) && (now - date) > 86400000) expiredOTPs.push({ subject, count: 1 });
    if (parcelRegex.test(subject)) parcelNotifications.push({ subject, count: 1 });
    if (inviteRegex.test(subject) && (now - date) > 604800000) pastInvites.push({ subject, count: 1 });
    // Old: older than 1 year (matching our query)
    if ((now - date) > (365 * 86400000)) oldEmails.push({ subject, count: 1 });
  }

  // E. Oldest for Challenge (take the last 50 from our 'old' subset)
  const oldestEmailsResult = oldMsgs.reverse().slice(0, 50).map(m => ({
    subject: getHeader(m, 'Subject') || '(no subject)',
    from: getHeader(m, 'From'),
    sizeEstimate: m.sizeEstimate,
    id: m.id
  }));

  return {
    unreadSenders: { items: unreadSenders, totalFetched: unreadMsgs.length, errorCount },
    heaviestEmails: { items: heaviestEmails, totalFetched: heavyMsgs.length, errorCount },
    repeatedSubjects: { items: repeatedSubjects, totalFetched: unreadMsgs.length, errorCount },
    expiredOTPs: { items: expiredOTPs, totalFetched: expiredOTPs.length, errorCount },
    parcelNotifications: { items: parcelNotifications, totalFetched: parcelNotifications.length, errorCount },
    oldEmails: { items: oldEmails, totalFetched: oldEmails.length, errorCount },
    pastInvites: { items: pastInvites, totalFetched: pastInvites.length, errorCount },
    redundantThreads: { items: redundantThreads, totalFetched: redundantThreads.length, errorCount },
    oldestEmails: { items: oldestEmailsResult, totalFetched: oldMsgs.length, errorCount }
  };
}

export async function deleteEmailsByQuery(
  token: string,
  query: string,
): Promise<{ success: boolean; count: number }> {
  const ids = await listAllMessageIds(token, query);
  if (ids.length === 0) return { success: true, count: 0 };

  const chunks = [];
  for (let i = 0; i < ids.length; i += 1000) {
    chunks.push(ids.slice(i, i + 1000));
  }

  for (const chunk of chunks) {
    const res = await fetch(`${GMAIL_API}/messages/batchDelete`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: chunk }),
    });
    if (!res.ok) throw new Error(`Batch delete failed: ${res.status}`);
  }

  return { success: true, count: ids.length };
}

export async function deleteMessage(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${GMAIL_API}/messages/${id}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}
