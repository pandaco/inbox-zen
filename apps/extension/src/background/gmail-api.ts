import type { SenderStat, SizeStat, SubjectStat, StatsResult, GlobalStats } from '../shared/types';
import { parseBatchResponse } from './gmail-parse';
import type { MessageMetadata } from './gmail-parse';
import { StatsAccumulator } from './stats-accumulator';

export type { SenderStat, SizeStat, SubjectStat, StatsResult, GlobalStats };

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';
const BATCH_API = 'https://www.googleapis.com/batch/gmail/v1';

// Quota math: messages.get (metadata) costs 5 units; the per-user limit is
// 250 units/s. Two workers, each fetching BATCH_SIZE=40 messages then
// sleeping BATCH_DELAY_MS=2s, yield ~40 msgs/s ≈ 200 units/s — inside the
// limit with headroom. On rate-limit errors each worker backs off
// adaptively (delay ×1.5 up to MAX_WORKER_DELAY_MS, decaying on success).
const BATCH_SIZE = 40;
const BATCH_DELAY_MS = 2000;
const MAX_WORKER_DELAY_MS = 8000;
const MAX_RETRIES = 6;
const MAX_BACKOFF_MS = 30_000;

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gmail API error: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

interface MessageListResponse {
  messages?: { id: string }[];
  nextPageToken?: string;
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

interface RateLimitError {
  status: number;
  message: string;
  retryAfterMs?: number;
}

async function fetchMetadataBatch(
  token: string,
  ids: string[],
  metadataHeaders: string[],
): Promise<MessageMetadata[]> {
  const boundary = `batch_${Math.random().toString(36).slice(2)}`;
  const fields = 'id,threadId,sizeEstimate,snippet,payload(headers)';

  const body = ids
    .map(id => {
      const params = new URLSearchParams({ format: 'metadata', fields });
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
      const retryAfter = Number(res.headers.get('Retry-After'));
      const err: RateLimitError = {
        status: res.status,
        message: 'Rate limited',
        retryAfterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : undefined,
      };
      throw err;
    }
    throw new Error(`Batch request failed: ${res.status}`);
  }
  return parseBatchResponse(await res.text(), res.headers.get('Content-Type') || '');
}

export type ProgressCallback = (
  fetched: number,
  total: number,
  partialData?: GlobalStats,
) => void;

interface FetchCallbacks {
  onBatch: (messages: MessageMetadata[]) => void;
  onProgress?: (fetched: number, total: number, errorCount: number) => void;
}

async function fetchAllMetadata(
  token: string,
  ids: string[],
  metadataHeaders: string[],
  { onBatch, onProgress }: FetchCallbacks,
): Promise<{ errorCount: number }> {
  let fetchedCount = 0;
  let errorCount = 0;
  let lastPartialSentAt = Date.now();

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    chunks.push(ids.slice(i, i + BATCH_SIZE));
  }

  const processWorker = async (workerChunks: string[][]) => {
    let delay = BATCH_DELAY_MS;

    for (const chunk of workerChunks) {
      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          const results = await fetchMetadataBatch(token, chunk, metadataHeaders);
          onBatch(results);
          fetchedCount += results.length;
          errorCount += chunk.length - results.length;
          success = true;
          // Recover throughput after a rate-limit episode.
          delay = Math.max(BATCH_DELAY_MS, delay / 1.5);
        } catch (err) {
          retries++;
          delay = Math.min(delay * 1.5, MAX_WORKER_DELAY_MS);
          if (retries < MAX_RETRIES) {
            const retryAfterMs = (err as RateLimitError)?.retryAfterMs;
            const backoff = Math.min(Math.pow(2, retries) * 1000, MAX_BACKOFF_MS);
            await sleep(retryAfterMs ?? backoff + Math.random() * 500);
          } else {
            errorCount += chunk.length;
          }
        }
      }

      const isFirst = fetchedCount <= BATCH_SIZE;
      const isLast = fetchedCount + errorCount >= ids.length;
      const elapsed = Date.now() - lastPartialSentAt;

      if (onProgress && (isFirst || isLast || elapsed > 3000)) {
        onProgress(fetchedCount, ids.length, errorCount);
        lastPartialSentAt = Date.now();
      }

      await sleep(delay);
    }
  };

  const half = Math.ceil(chunks.length / 2);
  await Promise.all([
    processWorker(chunks.slice(0, half)),
    processWorker(chunks.slice(half)),
  ]);

  return { errorCount };
}

export async function getGlobalStats(
  token: string,
  onProgress?: ProgressCallback,
): Promise<GlobalStats> {
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

  const acc = new StatsAccumulator(unreadSet, heavySet, oldSet, inviteSet);

  const { errorCount } = await fetchAllMetadata(
    token,
    allIds,
    ['From', 'Subject', 'Date', 'List-Unsubscribe'],
    {
      onBatch: messages => acc.add(messages),
      onProgress: onProgress
        ? (fetched, total, errors) => onProgress(fetched, total, acc.snapshot(fetched, errors))
        : undefined,
    },
  );

  return acc.snapshot(allIds.length, errorCount);
}

export async function deleteEmailsByQuery(token: string, query: string): Promise<{ success: boolean; count: number }> {
  const ids = await listAllMessageIds(token, query);
  if (ids.length === 0) return { success: true, count: 0 };
  for (let i = 0; i < ids.length; i += 1000) {
    const res = await fetch(`${GMAIL_API}/messages/batchDelete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids.slice(i, i + 1000) }),
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
