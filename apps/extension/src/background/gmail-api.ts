import type { SenderStat, SizeStat, SubjectStat, StatsResult, GlobalStats } from '../shared/types';

export type { SenderStat, SizeStat, SubjectStat, StatsResult, GlobalStats };

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const BATCH_API = 'https://www.googleapis.com/batch/gmail/v1';
const BATCH_SIZE = 40;       // Safer batch size for Gmail rate limits
const BATCH_DELAY_MS = 1200; // Increased delay to stay under quota
const MAX_RETRIES = 5;

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
  snippet?: string;
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
  
  // Strict fields selection to reduce response size and latency
  const fields = 'id,threadId,sizeEstimate,snippet,payload(headers)';

  const body = ids
    .map(id => {
      const params = new URLSearchParams({
        format: 'metadata',
        fields: fields,
      });
      metadataHeaders.forEach(h => params.append('metadataHeaders', h));

      return (
        `--${boundary}\r\n` +
        `Content-Type: application/http\r\n\r\n` +
        `GET /gmail/v1/users/me/messages/${id}?${params.toString()}\r\n\r\n`
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

  if (!res.ok) {
    if (res.status === 429 || res.status === 503) {
      throw { status: res.status, message: 'Rate limited' };
    }
    throw new Error(`Batch request failed: ${res.status}`);
  }
  const text = await res.text();
  const contentType = res.headers.get('Content-Type') || '';
  return parseBatchResponse(text, contentType);
}

export type ProgressCallback = (
  fetched: number,
  total: number,
  partialData?: GlobalStats,
  currentMessages?: MessageMetadata[],
  currentErrors?: number
) => void;

async function fetchAllMetadata(
  token: string,
  ids: string[],
  metadataHeaders: string[],
  onProgress?: ProgressCallback,
): Promise<{ messages: MessageMetadata[]; errorCount: number }> {
  const messages: MessageMetadata[] = [];
  let errorCount = 0;
  let lastPartialSentAt = Date.now();

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
      } catch (err: any) {
        retries++;
        if (retries < MAX_RETRIES) {
          const waitTime = Math.pow(2, retries) * 1000 + (Math.random() * 500);
          console.warn(`[Gmail API] Rate limited or error. Retrying in ${Math.round(waitTime)}ms...`, err);
          await sleep(waitTime);
        } else {
          console.error(`[Gmail API] Failed chunk after ${MAX_RETRIES} retries.`, err);
          errorCount += chunk.length;
        }
      }
    }

    // Send partial results:
    // 1. On the very first batch (immediate feedback)
    // 2. Every 3 seconds
    // 3. Every 5 batches (approx 200 emails)
    // 4. On the last batch
    const batchCount = Math.floor(i / BATCH_SIZE) + 1;
    const isFirst = batchCount === 1;
    const isLast = i + BATCH_SIZE >= ids.length;
    const elapsed = Date.now() - lastPartialSentAt;
    const shouldSendPartial = isFirst || isLast || (elapsed > 3000) || (batchCount % 5 === 0);
    
    if (onProgress) {
      onProgress(messages.length, ids.length, shouldSendPartial ? (true as any) : undefined, messages, errorCount);
      if (shouldSendPartial) lastPartialSentAt = Date.now();
    }

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
  const [unreadIds, heavyIds, oldIds, inviteIds] = await Promise.all([
    listAllMessageIds(token, 'in:inbox is:unread'),
    listAllMessageIds(token, 'in:inbox (has:attachment OR larger:100kb)'),
    listAllMessageIds(token, 'in:inbox older_than:1y'),
    listAllMessageIds(token, 'in:inbox (filename:invite.ics OR "google calendar")')
  ]);

  const unreadSet = new Set(unreadIds);
  const heavySet = new Set(heavyIds);
  const oldSet = new Set(oldIds);
  const inviteSet = new Set(inviteIds);
  const allIds = Array.from(new Set([...unreadIds, ...heavyIds, ...oldIds, ...inviteIds]));

  // Reusable calculation logic for partial and final results
  const calculateStats = (msgs: MessageMetadata[], fetchedCount: number, currentErrors: number): GlobalStats => {
    const filter = (idSet: Set<string>): MessageMetadata[] => msgs.filter(m => idSet.has(m.id));
    return {
      unreadSenders: processUnreadSenders(filter(unreadSet), fetchedCount, currentErrors),
      heaviestEmails: processHeaviest(filter(heavySet), fetchedCount, currentErrors),
      repeatedSubjects: processRepeatedSubjects(msgs, fetchedCount, currentErrors),
      expiredOTPs: processOTPs(msgs, fetchedCount, currentErrors),
      parcelNotifications: processParcels(msgs, fetchedCount, currentErrors),
      oldEmails: processOld(filter(oldSet), fetchedCount, currentErrors),
      pastInvites: processInvites(filter(inviteSet), msgs, fetchedCount, currentErrors),
      redundantThreads: processRedundant(msgs, fetchedCount, currentErrors),
      oldestEmails: processOldest(msgs, fetchedCount, currentErrors),
    };
  };

  // 3. One single crawl of metadata with partial updates
  const { messages, errorCount } = await fetchAllMetadata(
    token, 
    allIds, 
    ['From', 'Subject', 'Date', 'List-Unsubscribe'], 
    (fetched, total, shouldCompute, currentMsgs, currentErrors) => {
      if (onProgress) {
        const partial = (shouldCompute && currentMsgs) ? calculateStats(currentMsgs, fetched, currentErrors || 0) : undefined;
        onProgress(fetched, total, partial);
      }
    }
  );

  return calculateStats(messages, allIds.length, errorCount);
}

// --- Specific Processors ---

function processUnreadSenders(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SenderStat> {
  const now = Date.now();
  const senderCounts = new Map<string, { name: string; count: number; unsubscribeUrl?: string; firstDate: number; lastDate: number }>();
  
  for (const m of messages) {
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

  const items = [...senderCounts.entries()]
    .map(([email, s]) => {
      const days = Math.max(1, (s.lastDate - s.firstDate) / 86400000);
      const score = (s.count / days) * ( (now - s.lastDate) < 604800000 ? 2 : 1) * Math.log10(s.count + 1);
      return { sender: s.name || email, email, count: s.count, unsubscribeUrl: s.unsubscribeUrl, score };
    })
    .sort((a, b) => b.count - a.count);

  return { items, totalFetched, errorCount };
}

function processHeaviest(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SizeStat> {
  const items = messages
    .map(m => ({ subject: getHeader(m, 'Subject') || '(no subject)', from: getHeader(m, 'From'), sizeEstimate: m.sizeEstimate }))
    .sort((a, b) => b.sizeEstimate - a.sizeEstimate);
  return { items, totalFetched, errorCount };
}

function processRepeatedSubjects(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const counts = new Map<string, number>();
  for (const m of messages) {
    const s = getHeader(m, 'Subject') || '(no subject)';
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  const items = [...counts.entries()]
    .filter(([_, count]) => count > 2)
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processOTPs(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const otpPatterns = [/code/i, /otp/i, /verification/i, /votre mot de passe/i, /sécurité/i, /security/i];
  const items = messages
    .filter(m => {
      const s = getHeader(m, 'Subject') || '';
      const date = new Date(getHeader(m, 'Date')).getTime();
      return otpPatterns.some(p => p.test(s)) && (Date.now() - date > 86400000);
    })
    .map(m => ({ subject: getHeader(m, 'Subject'), count: 1 }));
  return { items, totalFetched, errorCount };
}

function processParcels(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const parcelPatterns = [/colis/i, /livraison/i, /delivery/i, /shipping/i, /expédition/i, /command/i, /order/i, /envoyé/i];
  const counts = new Map<string, number>();
  for (const m of messages) {
    const s = getHeader(m, 'Subject') || '';
    if (parcelPatterns.some(p => p.test(s))) {
      const generic = s.replace(/[a-zA-Z0-9]*\d[a-zA-Z0-9]*/g, '#').replace(/\s+/g, ' ').trim();
      counts.set(generic, (counts.get(generic) || 0) + 1);
    }
  }
  const items = [...counts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processOld(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const items = messages.map(m => ({ subject: getHeader(m, 'Subject'), count: 1 }));
  return { items, totalFetched, errorCount };
}

function processInvites(inviteMsgs: MessageMetadata[], allMessages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const inviteRegex = /invite\.ics|google calendar/i;
  const items = allMessages
    .filter(m => {
      const s = getHeader(m, 'Subject') || '';
      const date = new Date(getHeader(m, 'Date')).getTime();
      return (inviteRegex.test(s) || (inviteMsgs.some(im => im.id === m.id))) && (Date.now() - date > 86400000 * 7);
    })
    .map(m => ({ subject: getHeader(m, 'Subject'), count: 1 }));
  return { items, totalFetched, errorCount };
}

function processRedundant(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const threadCounts = new Map<string, number>();
  for (const m of messages) {
    if (m.threadId) threadCounts.set(m.threadId, (threadCounts.get(m.threadId) || 0) + 1);
  }
  const redundantThreadIds = new Set([...threadCounts.entries()].filter(([_, c]) => c > 5).map(([id]) => id));
  const subjects = new Map<string, number>();
  for (const m of messages) {
    if (m.threadId && redundantThreadIds.has(m.threadId)) {
      const s = getHeader(m, 'Subject').replace(/^Re:\s*/i, '');
      subjects.set(s, (subjects.get(s) || 0) + 1);
    }
  }
  const items = [...subjects.entries()].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processOldest(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SizeStat> {
  const items = messages
    .map(m => ({ 
      id: m.id, 
      subject: getHeader(m, 'Subject') || '(no subject)', 
      from: getHeader(m, 'From'), 
      sizeEstimate: new Date(getHeader(m, 'Date')).getTime(),
      snippet: m.snippet // Added snippet here
    }))
    .sort((a, b) => a.sizeEstimate - b.sizeEstimate);
  return { items, totalFetched, errorCount };
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
