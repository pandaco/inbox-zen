import {
  computeFlags,
  membershipUnion,
  diffCorpus,
  applyDelta,
  rebuildStats,
  serializeCorpus,
  deserializeCorpus,
  CORPUS_VERSION,
  FLAG_UNREAD,
  FLAG_HEAVY,
  FLAG_OLD,
  FLAG_INVITE,
} from './corpus';
import type { Corpus, MembershipSets, CorpusEntry } from './corpus';
import type { ParsedMessage } from './gmail-parse';
import { StatsAccumulator } from './stats-accumulator';

function sets(overrides: Partial<Record<keyof MembershipSets, string[]>> = {}): MembershipSets {
  return {
    unread: new Set(overrides.unread ?? []),
    heavy: new Set(overrides.heavy ?? []),
    old: new Set(overrides.old ?? []),
    invite: new Set(overrides.invite ?? []),
  };
}

function msg(id: string, overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    id,
    threadId: id,
    sizeEstimate: 1000,
    from: 'Sender <sender@x.com>',
    subject: `Subject ${id}`,
    dateMs: Date.now(),
    ...overrides,
  };
}

function entry(id: string, flags: number, overrides: Partial<ParsedMessage> = {}): CorpusEntry {
  return { ...msg(id, overrides), flags };
}

describe('computeFlags', () => {
  it('combines membership into a bitmask', () => {
    const s = sets({ unread: ['a'], heavy: ['a', 'b'], old: ['c'], invite: ['a'] });
    expect(computeFlags('a', s)).toBe(FLAG_UNREAD | FLAG_HEAVY | FLAG_INVITE);
    expect(computeFlags('b', s)).toBe(FLAG_HEAVY);
    expect(computeFlags('c', s)).toBe(FLAG_OLD);
    expect(computeFlags('z', s)).toBe(0);
  });
});

describe('membershipUnion', () => {
  it('unions all four sets', () => {
    const s = sets({ unread: ['a'], heavy: ['b'], old: ['c'], invite: ['a', 'd'] });
    expect(membershipUnion(s)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});

describe('diffCorpus', () => {
  it('finds new ids to fetch and stale ids to drop', () => {
    const corpus: Corpus = { a: entry('a', 0), b: entry('b', 0) };
    const fresh = new Set(['b', 'c', 'd']);
    const { toFetch, toDrop } = diffCorpus(corpus, fresh);
    expect(toFetch.sort()).toEqual(['c', 'd']);
    expect(toDrop).toEqual(['a']);
  });

  it('empty corpus means everything needs fetching (full sync)', () => {
    const { toFetch, toDrop } = diffCorpus({}, new Set(['a', 'b']));
    expect(toFetch.sort()).toEqual(['a', 'b']);
    expect(toDrop).toEqual([]);
  });

  it('no changes when corpus already matches the fresh union', () => {
    const corpus: Corpus = { a: entry('a', 0), b: entry('b', 0) };
    const { toFetch, toDrop } = diffCorpus(corpus, new Set(['a', 'b']));
    expect(toFetch).toEqual([]);
    expect(toDrop).toEqual([]);
  });
});

describe('applyDelta', () => {
  it('drops entries no longer in the fresh union', () => {
    const corpus: Corpus = { a: entry('a', FLAG_UNREAD), b: entry('b', FLAG_UNREAD) };
    const next = applyDelta(corpus, [], sets({ unread: ['a'] }));
    expect(Object.keys(next)).toEqual(['a']);
  });

  it('inserts newly fetched messages that belong to the fresh union', () => {
    const next = applyDelta({}, [msg('a')], sets({ unread: ['a'] }));
    expect(next['a']).toMatchObject({ id: 'a', flags: FLAG_UNREAD });
  });

  it('ignores fetched messages that fell outside the fresh union (already trashed etc.)', () => {
    const next = applyDelta({}, [msg('a')], sets({ unread: ['b'] }));
    expect(next['a']).toBeUndefined();
  });

  it('re-flags retained entries — read/unread transition drops the unread flag', () => {
    const corpus: Corpus = { a: entry('a', FLAG_UNREAD) };
    // 'a' is still in the union (e.g. it's now old) but no longer unread.
    const next = applyDelta(corpus, [], sets({ old: ['a'] }));
    expect(next['a'].flags).toBe(FLAG_OLD);
  });

  it('re-flags retained entries — a message aging past the 1y threshold gains FLAG_OLD', () => {
    const corpus: Corpus = { a: entry('a', FLAG_UNREAD) };
    const next = applyDelta(corpus, [], sets({ unread: ['a'], old: ['a'] }));
    expect(next['a'].flags).toBe(FLAG_UNREAD | FLAG_OLD);
  });

  it('does not mutate the input corpus', () => {
    const corpus: Corpus = { a: entry('a', FLAG_UNREAD) };
    const frozen = JSON.parse(JSON.stringify(corpus));
    applyDelta(corpus, [msg('b')], sets({ unread: ['a', 'b'] }));
    expect(corpus).toEqual(frozen);
  });
});

describe('rebuildStats', () => {
  it('derives membership sets from flags and matches a fresh accumulator over the same messages', () => {
    const messages = [
      msg('a', { from: 'News <news@x.com>', subject: 'Weekly digest' }),
      msg('b', { from: 'News <news@x.com>', subject: 'Weekly digest' }),
      msg('c', { subject: 'Big attachment', sizeEstimate: 5_000_000 }),
    ];
    const flagsById: Record<string, number> = { a: FLAG_UNREAD, b: FLAG_UNREAD, c: FLAG_HEAVY };
    const corpus: Corpus = Object.fromEntries(messages.map(m => [m.id, { ...m, flags: flagsById[m.id] }]));

    const rebuilt = rebuildStats(corpus, 3, 0);

    const acc = new StatsAccumulator(new Set(['a', 'b']), new Set(['c']), new Set(), new Set());
    acc.addParsed(messages);
    const fresh = acc.snapshot(3, 0);

    expect(rebuilt).toEqual(fresh);
  });

  it('is equivalent whether it replays from cache or fetches everything fresh (full sync = delta from empty corpus)', () => {
    const messages = [msg('a'), msg('b'), msg('c')];
    const s = sets({ unread: ['a'], heavy: ['b'], old: ['c'] });

    // "Full sync": apply the whole batch to an empty corpus in one shot.
    const fullCorpus = applyDelta({}, messages, s);
    const fullStats = rebuildStats(fullCorpus, 3, 0);

    // "Delta sync": messages already cached from a previous run.
    const cachedCorpus = applyDelta({}, messages, s);
    const deltaCorpus = applyDelta(cachedCorpus, [], s);
    const deltaStats = rebuildStats(deltaCorpus, 3, 0);

    expect(deltaStats).toEqual(fullStats);
  });
});

describe('serializeCorpus / deserializeCorpus', () => {
  it('round-trips a corpus through JSON, including a NaN dateMs', () => {
    const corpus: Corpus = {
      a: entry('a', FLAG_UNREAD, { dateMs: 12345 }),
      b: entry('b', FLAG_OLD, { dateMs: NaN }),
    };
    const stored = serializeCorpus(corpus, 999);
    // Simulate the JSON round-trip chrome.storage.local performs.
    const roundTripped = JSON.parse(JSON.stringify(stored));
    const back = deserializeCorpus(roundTripped);

    expect(back?.['a'].dateMs).toBe(12345);
    expect(Number.isNaN(back?.['b'].dateMs)).toBe(true);
  });

  it('returns null for a missing corpus', () => {
    expect(deserializeCorpus(undefined)).toBeNull();
  });

  it('returns null for a version mismatch, triggering a full sync', () => {
    const corpus: Corpus = { a: entry('a', 0) };
    const stored = serializeCorpus(corpus, 1);
    stored.version = CORPUS_VERSION + 1;
    expect(deserializeCorpus(stored)).toBeNull();
  });

  it('returns null for corrupt/malformed stored data', () => {
    expect(deserializeCorpus({ version: CORPUS_VERSION, cachedAt: 1, messages: null })).toBeNull();
    expect(deserializeCorpus({ version: CORPUS_VERSION, cachedAt: 1, messages: { a: { id: '' } } })).toBeNull();
    expect(deserializeCorpus('not an object')).toBeNull();
  });
});
