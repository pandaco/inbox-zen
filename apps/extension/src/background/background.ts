import { getGlobalStats, trashMessages, untrashMessages } from './gmail-api';
import type { BgMessage, BgResponse, PortMessage, GlobalStats, TrashResult } from '../shared/types';
import { deserializeCorpus, serializeCorpus, rebuildStats } from './corpus';
import type { Corpus, CorpusEntry } from './corpus';

export type { BgMessage, BgResponse };
export type { MessageType } from '../shared/types';

const TOKEN_KEY = 'gmail_access_token';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours — hard backstop, not the normal refresh path
const CACHE_KEY = 'cache_global_stats';
const CORPUS_KEY = 'cache_corpus';

// Ids the user trashed in this SW lifetime — an in-flight or subsequent sync
// filters these out so trashed rows don't resurrect before Gmail's indexes
// catch up. Lost on SW restart (worst case: a row reappears for one sync).
const recentlyTrashed = new Set<string>();

// Corpus entries pruned by a trash action, keyed by message id, kept around
// for the 10s Undo window. Lost on SW restart — undo then self-heals: the
// untrashed message is back in the mailbox and gets refetched on the next
// delta sync since it's no longer in the corpus.
const pendingUndo = new Map<string, CorpusEntry>();

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

async function loadCorpus(): Promise<Corpus> {
  try {
    const r = await chrome.storage.local.get(CORPUS_KEY);
    return deserializeCorpus(r[CORPUS_KEY]) ?? {};
  } catch {
    return {};
  }
}

async function saveCache(stats: GlobalStats, corpus: Corpus): Promise<void> {
  const cachedAt = Date.now();
  try {
    await chrome.storage.local.set({
      [CACHE_KEY]: { result: stats, cachedAt },
      [CORPUS_KEY]: serializeCorpus(corpus, cachedAt),
    });
  } catch {
    // Storage write failed (quota?) — degrade gracefully: keep the stats
    // cache if possible, drop the corpus. Next sync's diff sees it missing
    // and falls back to a full crawl.
    try {
      await chrome.storage.local.set({ [CACHE_KEY]: { result: stats, cachedAt } });
    } catch {
      /* give up silently — stats are still returned to the caller this run */
    }
  }
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

/**
 * Prune trashed ids from the stored corpus and return an exact, freshly
 * rebuilt GlobalStats — instant since it's just an in-memory recompute.
 * Returns undefined when there's no corpus yet (e.g. before the first full
 * sync), so the caller falls back to the client-side surgical row removal.
 */
async function pruneCorpusAndRebuild(ids: string[]): Promise<GlobalStats | undefined> {
  const corpus = await loadCorpus();
  if (Object.keys(corpus).length === 0) return undefined;

  const pruned: Corpus = { ...corpus };
  for (const id of ids) {
    const entry = pruned[id];
    if (entry) {
      pendingUndo.set(id, entry);
      delete pruned[id];
    }
  }

  const cached = await getCached();
  const stats = rebuildStats(
    pruned,
    Object.keys(pruned).length,
    cached?.result.unreadSenders.errorCount ?? 0,
  );
  await saveCache(stats, pruned);
  return stats;
}

/** Restore parked corpus entries for undone ids (self-heals if SW restarted). */
async function restoreCorpusAndRebuild(ids: string[]): Promise<GlobalStats | undefined> {
  const restored = ids.map(id => pendingUndo.get(id)).filter((e): e is CorpusEntry => !!e);
  if (restored.length === 0) return undefined;

  const corpus = await loadCorpus();
  for (const entry of restored) {
    corpus[entry.id] = entry;
    pendingUndo.delete(entry.id);
  }

  const cached = await getCached();
  const stats = rebuildStats(
    corpus,
    Object.keys(corpus).length,
    cached?.result.unreadSenders.errorCount ?? 0,
  );
  await saveCache(stats, corpus);
  return stats;
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

    case 'TRASH_MESSAGES': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      const { ids } = message as BgMessage & { ids: string[] };
      if (!ids?.length) return { success: false, error: 'Missing message ids' };
      try {
        const result = await trashMessages(token, ids);
        result.trashedIds.forEach(id => recentlyTrashed.add(id));
        const stats = await pruneCorpusAndRebuild(result.trashedIds);
        const data: TrashResult = { ...result, stats };
        return { success: true, data };
      } catch (err) {
        if (isAuthError(err)) {
          await tokenStore.remove(TOKEN_KEY);
          return { success: false, error: 'SESSION_EXPIRED' };
        }
        throw err;
      }
    }

    case 'UNTRASH_MESSAGES': {
      const token = await getStoredToken();
      if (!token) return { success: false, error: 'Not authenticated' };
      const { ids } = message as BgMessage & { ids: string[] };
      if (!ids?.length) return { success: false, error: 'Missing message ids' };
      try {
        const result = await untrashMessages(token, ids);
        result.trashedIds.forEach(id => recentlyTrashed.delete(id));
        const stats = await restoreCorpusAndRebuild(result.trashedIds);
        const data: TrashResult = { ...result, stats };
        return { success: true, data };
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

// A sync in flight is shared across concurrent port connections — a second
// "Sync now" click (or a second popup) joins the same crawl and its progress
// stream instead of starting a redundant one.
let inFlightSync: {
  promise: ReturnType<typeof getGlobalStats>;
  listeners: Set<(fetched: number, total: number, data?: GlobalStats) => void>;
} | null = null;

function runSync(
  token: string,
  corpus: Corpus,
  onProgress: (fetched: number, total: number, data?: GlobalStats) => void,
): ReturnType<typeof getGlobalStats> {
  if (inFlightSync) {
    inFlightSync.listeners.add(onProgress);
    return inFlightSync.promise.finally(() => inFlightSync?.listeners.delete(onProgress));
  }
  const listeners = new Set([onProgress]);
  const promise = getGlobalStats(token, {
    corpus,
    excludeIds: recentlyTrashed,
    onProgress: (fetched, total, data) => listeners.forEach(l => l(fetched, total, data)),
  }).finally(() => {
    inFlightSync = null;
  });
  inFlightSync = { promise, listeners };
  return promise;
}

// Port-based streaming for stats (progress updates + cache)
chrome.runtime.onConnect.addListener((port) => {
  if (port.sender?.id !== chrome.runtime.id) return;
  const [baseName, flag] = port.name.split(':') as [string, string | undefined];

  if (baseName !== 'GET_GLOBAL_STATS') return;

  // Plain: serve cache if present. ":refresh": delta sync against the
  // stored corpus. ":full": forced full sync (empty corpus), the escape
  // hatch offered when a sync has been producing errors.
  const mode: 'cache' | 'delta' | 'full' = flag === 'full' ? 'full' : flag === 'refresh' ? 'delta' : 'cache';

  const send = (msg: PortMessage<GlobalStats>): void => {
    try { port.postMessage(msg); } catch { /* port disconnected */ }
  };

  getStoredToken().then(async token => {
    if (!token) {
      send({ type: 'RESULT', success: false, error: 'Not authenticated' });
      return;
    }

    if (mode === 'cache') {
      const cached = await getCached();
      if (cached) {
        send({ type: 'RESULT', success: true, data: cached.result, cachedAt: cached.cachedAt });
        return;
      }
      // No cache (first run, or expired past the 24h backstop) — fall
      // through to a sync, delta against whatever corpus exists.
    }

    const corpus = mode === 'full' ? {} : await loadCorpus();

    const onProgress = (fetched: number, total: number, partialData?: GlobalStats): void => {
      send({
        type: 'PROGRESS',
        fetched,
        total,
        data: partialData,
      } as PortMessage<GlobalStats>);
    };

    runSync(token, corpus, onProgress)
      .then(async ({ stats, corpus: newCorpus }) => {
        const cachedAt = Date.now();
        await saveCache(stats, newCorpus);
        send({ type: 'RESULT', success: true, data: stats, cachedAt });
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
