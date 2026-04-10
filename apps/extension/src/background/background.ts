import { getGlobalStats, deleteEmailsByQuery, deleteMessage } from './gmail-api';
import type { BgMessage, BgResponse, PortMessage, GlobalStats } from '../shared/types';

export type { BgMessage, BgResponse };
export type { MessageType } from '../shared/types';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY = 'cache_global_stats';

interface CacheEntry {
  result: GlobalStats;
  cachedAt: number;
}

async function getCached(): Promise<CacheEntry | null> {
  const r = await chrome.storage.local.get(CACHE_KEY);
  const entry = r[CACHE_KEY] as CacheEntry | undefined;
  if (!entry || Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
  return entry;
}

async function setCached(result: GlobalStats): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: { result, cachedAt: Date.now() } });
}

async function authenticate(interactive = true): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError || !token) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth failed'));
        return;
      }
      resolve(token);
    });
  });
}

async function getStoredToken(): Promise<string | null> {
  try {
    // Try to get token silently
    return await authenticate(false);
  } catch {
    return null;
  }
}

async function clearToken(): Promise<void> {
  const token = await getStoredToken();
  if (token) {
    await new Promise<void>((resolve) => {
      chrome.identity.removeCachedAuthToken({ token }, () => {
        // Also revoke on Google side
        fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`).finally(() => resolve());
      });
    });
  }
}

function isAuthError(err: unknown): boolean {
  return (err as any)?.status === 401 || (err instanceof Error && err.message.includes('401'));
}

async function invalidateToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    chrome.identity.removeCachedAuthToken({ token }, resolve);
  });
}

async function handle(message: BgMessage): Promise<BgResponse> {
  switch (message.type) {
    case 'GET_AUTH_STATUS': {
      const token = await getStoredToken();
      return { success: true, data: { authenticated: token !== null } };
    }

    case 'AUTHENTICATE': {
      try {
        const token = await authenticate(true);
        return { success: true, data: { authenticated: !!token } };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Auth failed' };
      }
    }

    case 'LOGOUT': {
      await clearToken();
      return { success: true };
    }

    case 'DELETE_EMAILS_BY_QUERY': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      const { query } = message as any;
      if (!query) return { success: false, error: 'Missing query' };
      try {
        const data = await deleteEmailsByQuery(token, query);
        return { success: true, data };
      } catch (err) {
        if (isAuthError(err)) {
          await invalidateToken(token);
          return { success: false, error: 'SESSION_EXPIRED' };
        }
        throw err;
      }
    }

    case 'DELETE_MESSAGE': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      const { id } = message as any;
      if (!id) return { success: false, error: 'Missing message ID' };
      try {
        const data = await deleteMessage(token, id);
        return { success: data };
      } catch (err) {
        if (isAuthError(err)) {
          await invalidateToken(token);
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

  if (baseName !== 'GET_GLOBAL_STATS') return;

  const send = (msg: PortMessage<GlobalStats>): void => {
    try { port.postMessage(msg); } catch { /* port disconnected */ }
  };

  getStoredToken().then(async token => {
    if (!token) {
      send({ type: 'RESULT', success: false, error: 'Not authenticated' });
      return;
    }

    if (!forceRefresh) {
      const cached = await getCached();
      if (cached) {
        send({ type: 'RESULT', success: true, data: cached.result, cachedAt: cached.cachedAt });
        return;
      }
    }

    const onProgress = (fetched: number, total: number, partialData?: GlobalStats): void => {
      send({ 
        type: 'PROGRESS', 
        fetched, 
        total,
        data: partialData
      } as any);
    };

    getGlobalStats(token, onProgress)
      .then(async data => {
        const cachedAt = Date.now();
        await setCached(data);
        send({ type: 'RESULT', success: true, data, cachedAt });
      })
      .catch(async (err: unknown) => {
        if (isAuthError(err)) {
          await invalidateToken(token);
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
