import {
  getHeader,
  parseSender,
  extractUnsubscribeUrl,
  genericizeSubject,
  parseMessage,
  parseBatchResponse,
} from './gmail-parse';
import type { MessageMetadata } from './gmail-parse';

function msg(headers: Record<string, string>, extra: Partial<MessageMetadata> = {}): MessageMetadata {
  return {
    id: 'id-1',
    sizeEstimate: 1234,
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
    ...extra,
  };
}

describe('getHeader', () => {
  it('is case-insensitive', () => {
    expect(getHeader(msg({ 'FROM': 'a@b.c' }), 'from')).toBe('a@b.c');
  });

  it('returns empty string when missing', () => {
    expect(getHeader(msg({}), 'Subject')).toBe('');
  });
});

describe('parseSender', () => {
  it('parses "Name <email>" form', () => {
    expect(parseSender('Jane Doe <jane@example.com>')).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
    });
  });

  it('falls back to the raw value for bare addresses', () => {
    expect(parseSender('jane@example.com')).toEqual({
      name: 'jane@example.com',
      email: 'jane@example.com',
    });
  });

  it('handles quoted display names with extra spaces', () => {
    expect(parseSender('"Amazon.fr"   <no-reply@amazon.fr>')).toEqual({
      name: '"Amazon.fr"',
      email: 'no-reply@amazon.fr',
    });
  });
});

describe('extractUnsubscribeUrl', () => {
  it('extracts the first https URL in angle brackets', () => {
    expect(
      extractUnsubscribeUrl('<mailto:unsub@x.com>, <https://x.com/unsub?u=1>'),
    ).toBe('https://x.com/unsub?u=1');
  });

  it('returns undefined when only mailto is present', () => {
    expect(extractUnsubscribeUrl('<mailto:unsub@x.com>')).toBeUndefined();
  });
});

describe('genericizeSubject', () => {
  it('collapses tracking numbers so similar subjects group', () => {
    expect(genericizeSubject('Your parcel 1Z999AA10123456784 shipped')).toBe(
      'Your parcel # shipped',
    );
    expect(genericizeSubject('Your parcel 1Z888BB20987654321 shipped')).toBe(
      'Your parcel # shipped',
    );
  });

  it('keeps one placeholder per space-separated number group', () => {
    expect(genericizeSubject('Order 123 456 confirmed')).toBe('Order # # confirmed');
    expect(genericizeSubject('Ref ABC123XYZ shipped')).toBe('Ref # shipped');
  });
});

describe('parseMessage', () => {
  it('extracts all headers once', () => {
    const parsed = parseMessage(
      msg(
        {
          From: 'Jane <jane@x.com>',
          Subject: 'Hello',
          Date: 'Mon, 01 Jan 2024 10:00:00 +0000',
          'List-Unsubscribe': '<https://x.com/u>',
        },
        { threadId: 't-9', snippet: 'snip' },
      ),
    );
    expect(parsed).toEqual({
      id: 'id-1',
      threadId: 't-9',
      sizeEstimate: 1234,
      snippet: 'snip',
      from: 'Jane <jane@x.com>',
      subject: 'Hello',
      dateMs: new Date('Mon, 01 Jan 2024 10:00:00 +0000').getTime(),
      unsubscribeUrl: 'https://x.com/u',
    });
  });

  it('falls back to the message id as threadId and NaN date', () => {
    const parsed = parseMessage(msg({}));
    expect(parsed.threadId).toBe('id-1');
    expect(Number.isNaN(parsed.dateMs)).toBe(true);
    expect(parsed.unsubscribeUrl).toBeUndefined();
  });
});

// --- parseBatchResponse ---

const BOUNDARY = 'batch_abc123';
const CONTENT_TYPE = `multipart/mixed; boundary=${BOUNDARY}`;

function part(status: string, jsonBody: string): string {
  return (
    `\r\nContent-Type: application/http\r\n\r\n` +
    `HTTP/1.1 ${status}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${jsonBody}\r\n`
  );
}

function batchBody(...parts: string[]): string {
  return `--${BOUNDARY}${parts.join(`--${BOUNDARY}`)}--${BOUNDARY}--`;
}

describe('parseBatchResponse', () => {
  it('parses successful sub-responses', () => {
    const body = batchBody(
      part('200 OK', JSON.stringify({ id: 'm1', sizeEstimate: 10 })),
      part('200 OK', JSON.stringify({ id: 'm2', sizeEstimate: 20 })),
    );
    const result = parseBatchResponse(body, CONTENT_TYPE);
    expect(result.map(m => m.id)).toEqual(['m1', 'm2']);
  });

  it('returns empty when the boundary is missing from the content type', () => {
    expect(parseBatchResponse('anything', 'text/plain')).toEqual([]);
  });

  it('throws "Rate limited" on a 429 sub-response', () => {
    const body = batchBody(
      part('200 OK', JSON.stringify({ id: 'm1', sizeEstimate: 10 })),
      part('429 Too Many Requests', JSON.stringify({ error: { code: 429, message: 'Rate limit' } })),
    );
    expect(() => parseBatchResponse(body, CONTENT_TYPE)).toThrow('Rate limited');
  });

  it('throws "Rate limited" on a 403 quota error in the JSON body', () => {
    const body = batchBody(
      part('403 Forbidden', JSON.stringify({ error: { code: 403, message: 'User rate limit exceeded' } })),
    );
    expect(() => parseBatchResponse(body, CONTENT_TYPE)).toThrow('Rate limited');
  });

  it('skips non-retryable errors like 404', () => {
    const body = batchBody(
      part('404 Not Found', JSON.stringify({ error: { code: 404, message: 'Not Found' } })),
      part('200 OK', JSON.stringify({ id: 'm2', sizeEstimate: 20 })),
    );
    const result = parseBatchResponse(body, CONTENT_TYPE);
    expect(result.map(m => m.id)).toEqual(['m2']);
  });

  it('skips parts with malformed JSON without dying', () => {
    const body = batchBody(
      part('200 OK', '{not json'),
      part('200 OK', JSON.stringify({ id: 'm2', sizeEstimate: 20 })),
    );
    const result = parseBatchResponse(body, CONTENT_TYPE);
    expect(result.map(m => m.id)).toEqual(['m2']);
  });

  it('skips parts whose JSON has no id', () => {
    const body = batchBody(part('200 OK', JSON.stringify({ sizeEstimate: 5 })));
    expect(parseBatchResponse(body, CONTENT_TYPE)).toEqual([]);
  });
});
