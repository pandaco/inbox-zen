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
  const { messages, errorCount } = await fetchAllMetadata(token, ids, ['From'], onProgress);

  const counts = new Map<string, { name: string; count: number }>();
  for (const msg of messages) {
    const from = getHeader(msg, 'From');
    if (!from) continue;
    const { name, email } = parseSender(from);
    if (!email) continue;
    const existing = counts.get(email);
    if (existing) {
      existing.count++;
    } else {
      counts.set(email, { name, count: 1 });
    }
  }

  const items = [...counts.entries()]
    .map(([email, { name, count }]) => ({ sender: name || email, email, count }))
    .sort((a, b) => b.count - a.count);

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
