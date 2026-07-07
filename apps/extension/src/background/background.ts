import { getGlobalStats, deleteEmailsByQuery, deleteMessage } from './gmail-api';
import type { BgMessage, BgResponse, PortMessage, GlobalStats } from '../shared/types';

export type { BgMessage, BgResponse };
export type { MessageType } from '../shared/types';

const TOKEN_KEY = 'gmail_access_token';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY = 'cache_global_stats';

const SCOPES = [
  'https://mail.google.com/',
].join(' ');

// Tokens are kept in session storage: in-memory only, cleared when the
// browser exits. Silent re-auth restores them transparently on next use.
const tokenStore = chrome.storage.session;

// Drop any token issued under a previous (narrower) scope so the next
// getStoredToken() triggers a re-auth with the current scopes.
chrome.runtime.onInstalled.addListener(() => {
  void tokenStore.remove(TOKEN_KEY);
  void chrome.storage.local.remove(TOKEN_KEY);
});

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

async function getManifestClientId(): Promise<string> {
  const manifest = chrome.runtime.getManifest() as chrome.runtime.Manifest & {
    oauth2?: { client_id: string };
  };
  return manifest.oauth2?.client_id ?? '';
}

async function authenticate(interactive = true): Promise<string> {
  const clientId = await getManifestClientId();
  const redirectUri = `https://${chrome.runtime.id}.chromiumapp.org/`;
  
  // We remove 'prompt=consent' to allow silent re-auth if already authorized
  const authUrl =
    `https://accounts.google.com/o/oauth2/v2/auth` +
    `?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=token` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url: authUrl, interactive }, (responseUrl) => {
      if (chrome.runtime.lastError || !responseUrl) {
        reject(new Error(chrome.runtime.lastError?.message ?? 'Auth failed'));
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
  const result = await tokenStore.get(TOKEN_KEY);
  let token = (result[TOKEN_KEY] as string | undefined) ?? null;

  if (!token) {
    try {
      // Try silent auth if no token stored
      token = await authenticate(false);
      if (token) await storeToken(token);
    } catch {
      return null;
    }
  }
  return token;
}

async function storeToken(token: string): Promise<void> {
  await tokenStore.set({ [TOKEN_KEY]: token });
}

async function clearToken(): Promise<void> {
  // Read the raw stored value — getStoredToken() would mint a fresh token
  // via silent auth just to revoke it.
  const result = await tokenStore.get(TOKEN_KEY);
  const token = (result[TOKEN_KEY] as string | undefined) ?? null;
  if (token) {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    }).catch(() => {
      /* ignore revoke errors */
    });
  }
  await tokenStore.remove(TOKEN_KEY);
}

function isAuthError(err: unknown): boolean {
  return (err as { status?: number })?.status === 401 || (err instanceof Error && err.message.includes('401'));
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
        await storeToken(token);
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
      const { query } = message as BgMessage & { query: string };
      if (!query) return { success: false, error: 'Missing query' };
      try {
        const data = await deleteEmailsByQuery(token, query);
        return { success: true, data };
      } catch (err) {
        if (isAuthError(err)) {
          await tokenStore.remove(TOKEN_KEY);
          return { success: false, error: 'SESSION_EXPIRED' };
        }
        throw err;
      }
    }

    case 'DELETE_MESSAGE': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      const { id } = message as BgMessage & { id: string };
      if (!id) return { success: false, error: 'Missing message ID' };
      try {
        const data = await deleteMessage(token, id);
        return { success: data };
      } catch (err) {
        if (isAuthError(err)) {
          await tokenStore.remove(TOKEN_KEY);
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
  if (port.sender?.id !== chrome.runtime.id) return;
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
      } as PortMessage<GlobalStats>);
    };

    getGlobalStats(token, onProgress)
      .then(async data => {
        const cachedAt = Date.now();
        await setCached(data);
        send({ type: 'RESULT', success: true, data, cachedAt });
      })
      .catch(async (err: unknown) => {
        if (isAuthError(err)) {
          await tokenStore.remove(TOKEN_KEY);
          send({ type: 'RESULT', success: false, error: 'SESSION_EXPIRED' });
        } else {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          send({ type: 'RESULT', success: false, error: msg });
        }
      });
  });
});

chrome.runtime.onMessage.addListener((message: BgMessage, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  handle(message)
    .then(sendResponse)
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      sendResponse({ success: false, error: msg });
    });
  return true; // keep channel open for async response
});
