/**
 * Pure parsing helpers for the Gmail REST API — no chrome.* dependency,
 * fully unit-testable.
 */

export interface MessageMetadata {
  id: string;
  threadId?: string;
  sizeEstimate: number;
  snippet?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

/** A message with its headers extracted once, so processors never re-scan them. */
export interface ParsedMessage {
  id: string;
  threadId: string;
  sizeEstimate: number;
  snippet?: string;
  from: string;
  subject: string;
  /** NaN when the Date header is missing or unparsable. */
  dateMs: number;
  unsubscribeUrl?: string;
}

export function getHeader(msg: MessageMetadata, name: string): string {
  return (
    msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  );
}

export function parseSender(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { name: from, email: from };
}

export function extractUnsubscribeUrl(listUnsubscribeHeader: string): string | undefined {
  return listUnsubscribeHeader.match(/<(https?:\/\/[^>]+)>/)?.[1];
}

/** Collapse numbers (tracking IDs, order numbers…) so similar subjects group together. */
export function genericizeSubject(subject: string): string {
  return subject.replace(/\S*\d\S*/g, '#').replace(/#+/g, '#').replace(/\s+/g, ' ').trim();
}

export function parseMessage(msg: MessageMetadata): ParsedMessage {
  const unsub = getHeader(msg, 'List-Unsubscribe');
  return {
    id: msg.id,
    threadId: msg.threadId || msg.id,
    sizeEstimate: msg.sizeEstimate || 0,
    snippet: msg.snippet,
    from: getHeader(msg, 'From'),
    subject: getHeader(msg, 'Subject'),
    dateMs: new Date(getHeader(msg, 'Date')).getTime(),
    unsubscribeUrl: unsub ? extractUnsubscribeUrl(unsub) : undefined,
  };
}

/** Thrown (as `Error('Rate limited')`) to signal the caller should retry the chunk. */
const RATE_LIMITED = 'Rate limited';

interface SubResponse {
  status: number;
  body: string;
}

/** Split one multipart/mixed part into its HTTP status line and JSON body. */
function parseSubResponse(part: string): SubResponse | null {
  const statusMatch = part.match(/^HTTP\/1\.[01] (\d{3})/m);
  if (!statusMatch) return null;
  // The JSON body starts after the blank line that ends the sub-response headers.
  const statusIdx = part.indexOf(statusMatch[0]);
  const bodyIdx = part.indexOf('\r\n\r\n', statusIdx);
  return {
    status: Number(statusMatch[1]),
    body: bodyIdx === -1 ? '' : part.slice(bodyIdx + 4).trim(),
  };
}

export function parseBatchResponse(text: string, contentType: string): MessageMetadata[] {
  const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/);
  if (!boundaryMatch) return [];
  const boundary = boundaryMatch[1];

  return text
    .split(`--${boundary}`)
    .slice(1, -1)
    .flatMap(part => {
      const sub = parseSubResponse(part);
      if (!sub) return [];

      let parsed: (MessageMetadata & { error?: { code?: number; message?: string } }) | null;
      try {
        parsed = JSON.parse(sub.body) as MessageMetadata & {
          error?: { code?: number; message?: string };
        };
      } catch {
        parsed = null;
      }

      const errCode = parsed?.error?.code ?? (sub.status >= 400 ? sub.status : undefined);
      if (errCode !== undefined) {
        const msg = (parsed?.error?.message || '').toLowerCase();
        const isRetryable =
          errCode === 429 ||
          errCode === 503 ||
          (errCode === 403 &&
            (msg.includes('rate') || msg.includes('quota') || msg.includes('limit') || part.includes('ateLimitExceeded')));
        if (isRetryable) throw new Error(RATE_LIMITED);
        // Non-retryable error (e.g. 404 Message Not Found) — skip this message.
        return [];
      }

      if (!parsed?.id) return [];
      return [parsed];
    });
}
