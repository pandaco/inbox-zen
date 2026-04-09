import { getTopUnreadSenders, getTopHeaviestEmails, getTopRepeatedSubjects, getExpiredOTPs, getParcelNotifications } from './gmail-api';
import type { BgMessage, BgResponse, PortMessage, StatsResult, SenderStat, SizeStat, SubjectStat } from '../shared/types';

export type { BgMessage, BgResponse };
export type { MessageType } from '../shared/types';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
].join(' ');

const TOKEN_KEY = 'gmail_access_token';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_KEYS = {
  GET_TOP_UNREAD_SENDERS: 'cache_unread_senders',
  GET_TOP_HEAVIEST_EMAILS: 'cache_heaviest_emails',
  GET_TOP_REPEATED_SUBJECTS: 'cache_repeated_subjects',
  GET_EXPIRED_OTPS: 'cache_expired_otps',
  GET_PARCEL_NOTIFICATIONS: 'cache_parcel_notifications',
} as const;

type CachedPortName = keyof typeof CACHE_KEYS;

interface CacheEntry<T> {
  result: StatsResult<T>;
  cachedAt: number;
}

async function getCached<T>(key: string): Promise<CacheEntry<T> | null> {
  const r = await chrome.storage.local.get(key);
  const entry = r[key] as CacheEntry<T> | undefined;
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry;
}

async function setCached<T>(key: string, result: StatsResult<T>): Promise<void> {
  await chrome.storage.local.set({ [key]: { result, cachedAt: Date.now() } });
}

async function getManifestClientId(): Promise<string> {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & {
    oauth2?: { client_id: string };
  };
  return manifest.oauth2?.client_id ?? '';
}

async function authenticate(): Promise<string> {
  const clientId = await getManifestClientId();
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&prompt=consent`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth cancelled'));
        return;
      }
      const hash = new URL(responseUrl).hash.slice(1);
      const params = new URLSearchParams(hash);
      const token = params.get('access_token');
      if (!token) {
        reject(new Error('No access token in response'));
        return;
      }
      resolve(token);
    });
  });
}

async function getStoredToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string | undefined) ?? null;
}

async function storeToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}

async function clearToken(): Promise<void> {
  const token = await getStoredToken();
  if (token) {
    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
  }
  await chrome.storage.local.remove(TOKEN_KEY);
}

function isAuthError(err: unknown): boolean {
  return err instanceof Error && /40[13]/.test(err.message);
}

async function handle(message: BgMessage): Promise<BgResponse> {
  switch (message.type) {
    case 'GET_AUTH_STATUS': {
      const token = await getStoredToken();
      return { success: true, data: { authenticated: token !== null } };
    }

    case 'AUTHENTICATE': {
      const token = await authenticate();
      await storeToken(token);
      return { success: true, data: { authenticated: true } };
    }

    case 'LOGOUT': {
      await clearToken();
      return { success: true };
    }

    case 'GET_TOP_UNREAD_SENDERS': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const data = await getTopUnreadSenders(token);
        return { success: true, data };
      } catch (err) {
        if (isAuthError(err)) {
          await chrome.storage.local.remove(TOKEN_KEY);
          return { success: false, error: 'SESSION_EXPIRED' };
        }
        throw err;
      }
    }

    case 'GET_TOP_HEAVIEST_EMAILS': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      try {
        const data = await getTopHeaviestEmails(token);
        return { success: true, data };
      } catch (err) {
        if (isAuthError(err)) {
          await chrome.storage.local.remove(TOKEN_KEY);
          return { success: false, error: 'SESSION_EXPIRED' };
        }
        throw err;
      }
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

// Port-based streaming for stats (progress updates + cache)
chrome.runtime.onConnect.addListener((port) => {
  const [baseName, flag] = port.name.split(':') as [string, string | undefined];
  const forceRefresh = flag === 'refresh';

  if (!(baseName in CACHE_KEYS)) return;

  const portName = baseName as CachedPortName;
  const cacheKey = CACHE_KEYS[portName];

  const send = <T>(msg: PortMessage<T>): void => {
    try { port.postMessage(msg); } catch { /* port disconnected */ }
  };

  getStoredToken().then(async token => {
    if (!token) {
      send({ type: 'RESULT', success: false, error: 'Not authenticated' });
      return;
    }

    if (!forceRefresh) {
      const cached = await getCached<any>(cacheKey);
      if (cached) {
        send({ type: 'RESULT', success: true, data: cached.result, cachedAt: cached.cachedAt });
        return;
      }
    }

    const onProgress = (fetched: number, total: number): void =>
      send({ type: 'PROGRESS', fetched, total });

    let promise: Promise<StatsResult<any>>;
    switch (portName) {
      case 'GET_TOP_UNREAD_SENDERS': promise = getTopUnreadSenders(token, onProgress); break;
      case 'GET_TOP_HEAVIEST_EMAILS': promise = getTopHeaviestEmails(token, onProgress); break;
      case 'GET_TOP_REPEATED_SUBJECTS': promise = getTopRepeatedSubjects(token, onProgress); break;
      case 'GET_EXPIRED_OTPS': promise = getExpiredOTPs(token, onProgress); break;
      case 'GET_PARCEL_NOTIFICATIONS': promise = getParcelNotifications(token, onProgress); break;
      default: return;
    }

    promise
      .then(async data => {
        const cachedAt = Date.now();
        await setCached(cacheKey, data);
        send({ type: 'RESULT', success: true, data, cachedAt });
      })
      .catch((err: unknown) => {
        if (isAuthError(err)) {
          chrome.storage.local.remove(TOKEN_KEY);
          send({ type: 'RESULT', success: false, error: 'SESSION_EXPIRED' });
        } else {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          send({ type: 'RESULT', success: false, error: msg });
        }
      });
  });
});

chrome.runtime.onMessage.addListener((message: BgMessage, _sender, sendResponse) => {
  handle(message)
    .then(sendResponse)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ success: false, error: msg });
    });
  return true; // keep channel open for async response
});
