import type { SenderStat, SizeStat, SubjectStat, StatsResult } from '../shared/types';

export type { SenderStat, SizeStat, SubjectStat, StatsResult };

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
  const fields = 'id,sizeEstimate,payload/headers';

  const body =
    ids
      .map(
        (id, idx) =>
          `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item-${idx}>\r\n\r\n` +
          `GET /gmail/v1/users/me/messages/${id}?format=metadata&${headerParams}&fields=${fields} HTTP/1.1\r\n\r\n`,
      )
      .join('') + `--${boundary}--`;

  const res = await fetch(BATCH_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/mixed; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) throw new Error(`Gmail batch error: ${res.status} ${res.statusText}`);

  const text = await res.text();
  return parseBatchResponse(text, res.headers.get('Content-Type') ?? '');
}

async function fetchWithRetry(
  fn: () => Promise<MessageMetadata[]>,
  attempt = 0,
): Promise<MessageMetadata[]> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_RETRIES) throw err;
    // Longer wait on rate limit errors
    const is429 = err instanceof Error && err.message.includes('429');
    const delay = is429 ? 2000 * (attempt + 1) : 500 * Math.pow(2, attempt);
    await sleep(delay);
    return fetchWithRetry(fn, attempt + 1);
  }
}

type ProgressCallback = (fetched: number, total: number) => void;

/** Sequential batches with delay to stay within Gmail quota */
async function fetchAllMetadata(
  token: string,
  ids: string[],
  metadataHeaders: string[],
  onProgress?: ProgressCallback,
): Promise<{ messages: MessageMetadata[]; errorCount: number }> {
  const messages: MessageMetadata[] = [];
  let errorCount = 0;
  let fetched = 0;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    try {
      const batch = await fetchWithRetry(
        () => fetchMetadataBatch(token, chunk, metadataHeaders),
      );
      messages.push(...batch);
      fetched += batch.length;
    } catch {
      errorCount += chunk.length;
      fetched += chunk.length;
    }
    onProgress?.(fetched, ids.length);
    if (i + BATCH_SIZE < ids.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { messages, errorCount };
}

export async function getTopUnreadSenders(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SenderStat>> {
  const ids = await listAllMessageIds(token, 'in:inbox is:unread');
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['From', 'List-Unsubscribe', 'Date'], onProgress);

  const counts = new Map<string, { name: string; count: number; unsubscribeUrl?: string; firstDate: number; lastDate: number }>();
  const now = Date.now();
  for (const msg of messages) {
    const from = getHeader(msg, 'From');
    if (!from) continue;
    const { name, email } = parseSender(from);
    if (!email) continue;
    
    const dateStr = getHeader(msg, 'Date');
    const date = dateStr ? new Date(dateStr).getTime() : now;

    const unsub = getHeader(msg, 'List-Unsubscribe');
    const unsubMatch = unsub?.match(/<(https?:\/\/[^>]+)>/);
    const unsubscribeUrl = unsubMatch?.[1];

    const existing = counts.get(email);
    if (existing) {
      existing.count++;
      if (!existing.unsubscribeUrl) existing.unsubscribeUrl = unsubscribeUrl;
      existing.firstDate = Math.min(existing.firstDate, date);
      existing.lastDate = Math.max(existing.lastDate, date);
    } else {
      counts.set(email, { name, count: 1, unsubscribeUrl, firstDate: date, lastDate: date });
    }
  }

  const items = [...counts.entries()]
    .map(([email, { name, count, unsubscribeUrl, firstDate, lastDate }]) => {
      // Noise score calculation:
      // Higher frequency = higher score.
      // Recency also matters: emails in the last 7 days are weighted more.
      const daysDiff = Math.max(1, (lastDate - firstDate) / (1000 * 60 * 60 * 24));
      const frequency = count / daysDiff; // emails per day
      const isRecent = (now - lastDate) < (7 * 1000 * 60 * 60 * 24);
      const score = frequency * (isRecent ? 2 : 1) * Math.log10(count + 1);

      return { 
        sender: name || email, 
        email, 
        count, 
        unsubscribeUrl,
        score
      };
    })
    .sort((a, b) => b.score - a.score);

  return { items, totalFetched: messages.length, errorCount };
}

export async function getTopHeaviestEmails(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SizeStat>> {
  const ids = await listAllMessageIds(token, 'has:attachment OR larger:100kb');
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject', 'From'], onProgress);

  const items = messages
    .map(msg => ({
      subject: getHeader(msg, 'Subject') || '(no subject)',
      from: getHeader(msg, 'From'),
      sizeEstimate: msg.sizeEstimate,
    }))
    .sort((a, b) => b.sizeEstimate - a.sizeEstimate);

  return { items, totalFetched: messages.length, errorCount };
}

export async function getTopRepeatedSubjects(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SubjectStat>> {
  const ids = await listAllMessageIds(token, 'in:inbox is:unread');
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject'], onProgress);

  const counts = new Map<string, number>();
  for (const msg of messages) {
    const subject = getHeader(msg, 'Subject') || '(no subject)';
    counts.set(subject, (counts.get(subject) || 0) + 1);
  }

  const items = [...counts.entries()]
    .map(([subject, count]) => ({ subject, count }))
    .sort((a, b) => b.count - a.count);

  return { items, totalFetched: messages.length, errorCount };
}

export async function getExpiredOTPs(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SubjectStat>> {
  const query = '(verification OR OTP OR "one-time password" OR code) older_than:1d';
  const ids = await listAllMessageIds(token, query);
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject'], onProgress);

  const items = messages.map(m => ({
    subject: getHeader(m, 'Subject') || '(no subject)',
    count: 1, // Single occurrence for list
  }));

  return { items, totalFetched: messages.length, errorCount };
}

export async function getParcelNotifications(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SubjectStat>> {
  const query = '(shipping OR delivery OR "colis" OR "livraison" OR "expédition")';
  const ids = await listAllMessageIds(token, query);
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject'], onProgress);

  const items = messages.map(m => ({
    subject: getHeader(m, 'Subject') || '(no subject)',
    count: 1,
  }));

  return { items, totalFetched: messages.length, errorCount };
}

export async function getOldEmails(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SubjectStat>> {
  const query = 'older_than:2y -has:userlabels';
  const ids = await listAllMessageIds(token, query);
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject'], onProgress);

  const items = messages.map(m => ({
    subject: getHeader(m, 'Subject') || '(no subject)',
    count: 1,
  }));

  return { items, totalFetched: messages.length, errorCount };
}

export async function getPastCalendarInvites(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SubjectStat>> {
  const query = 'filename:invite.ics older_than:7d';
  const ids = await listAllMessageIds(token, query);
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject'], onProgress);

  const items = messages.map(m => ({
    subject: getHeader(m, 'Subject') || '(no subject)',
    count: 1,
  }));

  return { items, totalFetched: messages.length, errorCount };
}

export async function deleteEmailsByQuery(
  token: string,
  query: string,
): Promise<{ success: boolean; count: number }> {
  const ids = await listAllMessageIds(token, query);
  if (ids.length === 0) return { success: true, count: 0 };

  // Gmail batchDelete supports up to 1000 IDs per call
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

export async function getRedundantThreads(
  token: string,
  onProgress?: ProgressCallback,
): Promise<StatsResult<SubjectStat>> {
  // We search for long threads (arbitrary > 5 messages)
  // We'll approximate by searching for threads with multiple messages grouping by threadId.
  
  const ids = await listAllMessageIds(token, 'in:inbox is:unread');
  // This is already done in unread senders. 
  // Let's create a specific view for "Deep Threads"
  
  onProgress?.(0, ids.length);
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['Subject', 'ThreadId'], onProgress);

  const threadCounts = new Map<string, { subject: string; count: number }>();
  for (const m of messages) {
    const threadId = (m as any).threadId || m.id;
    const existing = threadCounts.get(threadId);
    if (existing) {
      existing.count++;
    } else {
      threadCounts.set(threadId, {
        subject: getHeader(m, 'Subject') || '(no subject)',
        count: 1
      });
    }
  }

  const items = [...threadCounts.values()]
    .filter(t => t.count > 3) // Only threads with multiple unread messages
    .sort((a, b) => b.count - a.count);

  return { items, totalFetched: messages.length, errorCount };
}

export async function getOldestEmails(
  token: string,
  limit = 20
): Promise<StatsResult<SizeStat>> {
  // We search for the oldest emails in the inbox
  const query = 'in:inbox';
  const ids = await listAllMessageIds(token, query);
  // listAllMessageIds returns IDs in descending date order (newest first)
  // We reverse to get oldest
  const oldestIds = ids.reverse().slice(0, limit);
  
  const { messages, errorCount } = await fetchAllMetadata(token, oldestIds, ['Subject', 'From', 'Date']);

  const items = messages.map(m => ({
    subject: getHeader(m, 'Subject') || '(no subject)',
    from: getHeader(m, 'From'),
    sizeEstimate: (m as any).sizeEstimate || 0,
    id: m.id // needed for action
  }));

  return { items, totalFetched: messages.length, errorCount };
}

export async function deleteMessage(token: string, id: string): Promise<boolean> {
  const res = await fetch(`${GMAIL_API}/messages/${id}/trash`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}
