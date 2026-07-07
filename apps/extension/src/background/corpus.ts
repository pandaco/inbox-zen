/**
 * Message corpus — the persistent cache that makes re-syncs incremental.
 *
 * Every message the crawl has ever fetched is kept as a ParsedMessage plus a
 * category bitmask (unread/heavy/old/invite, refreshed from the cheap ID list
 * queries on every sync). Since Gmail message headers are immutable, cached
 * entries never go stale; only membership changes — and that comes fresh from
 * the queries each time. A full sync is just a delta sync against an empty
 * corpus, so there is exactly one sync code path.
 *
 * Pure module: no chrome.* dependency, fully unit-testable.
 */
import type { GlobalStats } from '../shared/types';
import type { ParsedMessage } from './gmail-parse';
import { StatsAccumulator } from './stats-accumulator';

/** Bump when CorpusEntry's shape changes — mismatched caches trigger a full sync. */
export const CORPUS_VERSION = 1;

export const FLAG_UNREAD = 1;
export const FLAG_HEAVY = 2;
export const FLAG_OLD = 4;
export const FLAG_INVITE = 8;

export interface CorpusEntry extends ParsedMessage {
  flags: number;
}

export type Corpus = Record<string, CorpusEntry>;

export interface MembershipSets {
  unread: Set<string>;
  heavy: Set<string>;
  old: Set<string>;
  invite: Set<string>;
}

export function computeFlags(id: string, sets: MembershipSets): number {
  return (
    (sets.unread.has(id) ? FLAG_UNREAD : 0) |
    (sets.heavy.has(id) ? FLAG_HEAVY : 0) |
    (sets.old.has(id) ? FLAG_OLD : 0) |
    (sets.invite.has(id) ? FLAG_INVITE : 0)
  );
}

export function membershipUnion(sets: MembershipSets): Set<string> {
  return new Set([...sets.unread, ...sets.heavy, ...sets.old, ...sets.invite]);
}

/** Which ids need a metadata fetch, and which cached entries left the inbox. */
export function diffCorpus(
  corpus: Corpus,
  freshUnion: Set<string>,
): { toFetch: string[]; toDrop: string[] } {
  const toFetch: string[] = [];
  for (const id of freshUnion) {
    if (!(id in corpus)) toFetch.push(id);
  }
  const toDrop: string[] = [];
  for (const id of Object.keys(corpus)) {
    if (!freshUnion.has(id)) toDrop.push(id);
  }
  return { toFetch, toDrop };
}

/**
 * Fold a sync's outcome into the corpus: drop departed messages, insert the
 * newly fetched ones, and re-flag every retained entry against the fresh
 * membership sets (read/unread transitions, messages aging past 1 year…).
 * Returns a new corpus object; the input is not mutated.
 */
export function applyDelta(
  corpus: Corpus,
  fetched: ParsedMessage[],
  sets: MembershipSets,
): Corpus {
  const freshUnion = membershipUnion(sets);
  const next: Corpus = {};
  for (const [id, entry] of Object.entries(corpus)) {
    if (freshUnion.has(id)) {
      next[id] = { ...entry, flags: computeFlags(id, sets) };
    }
  }
  for (const m of fetched) {
    if (!m.id || !freshUnion.has(m.id)) continue;
    next[m.id] = { ...m, flags: computeFlags(m.id, sets) };
  }
  return next;
}

/** Recompute the full GlobalStats from the corpus — in-memory, milliseconds. */
export function rebuildStats(corpus: Corpus, totalFetched: number, errorCount: number): GlobalStats {
  const unread = new Set<string>();
  const heavy = new Set<string>();
  const old = new Set<string>();
  const invite = new Set<string>();
  const entries = Object.values(corpus);
  for (const e of entries) {
    if (e.flags & FLAG_UNREAD) unread.add(e.id);
    if (e.flags & FLAG_HEAVY) heavy.add(e.id);
    if (e.flags & FLAG_OLD) old.add(e.id);
    if (e.flags & FLAG_INVITE) invite.add(e.id);
  }
  const acc = new StatsAccumulator(unread, heavy, old, invite);
  acc.addParsed(entries);
  return acc.snapshot(totalFetched, errorCount);
}

// --- storage (de)serialization -------------------------------------------
// chrome.storage.local serializes to JSON, which turns NaN into null. A
// missing/unparsable Date header yields dateMs = NaN, so round-trip it
// explicitly to preserve the "no date" semantics of NaN comparisons.

interface StoredEntry extends Omit<CorpusEntry, 'dateMs'> {
  dateMs: number | null;
}

export interface StoredCorpus {
  version: number;
  cachedAt: number;
  messages: Record<string, StoredEntry>;
}

export function serializeCorpus(corpus: Corpus, cachedAt: number): StoredCorpus {
  const messages: Record<string, StoredEntry> = {};
  for (const [id, e] of Object.entries(corpus)) {
    messages[id] = { ...e, dateMs: Number.isFinite(e.dateMs) ? e.dateMs : null };
  }
  return { version: CORPUS_VERSION, cachedAt, messages };
}

/** Returns null when the stored corpus is missing, corrupt, or from another version. */
export function deserializeCorpus(stored: unknown): Corpus | null {
  const s = stored as StoredCorpus | undefined;
  if (!s || s.version !== CORPUS_VERSION || typeof s.messages !== 'object' || s.messages === null) {
    return null;
  }
  const corpus: Corpus = {};
  for (const [id, e] of Object.entries(s.messages)) {
    if (!e || typeof e.id !== 'string' || !e.id) return null;
    corpus[id] = { ...e, dateMs: e.dateMs === null ? NaN : e.dateMs };
  }
  return corpus;
}
