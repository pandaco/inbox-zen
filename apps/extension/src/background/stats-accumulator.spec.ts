import { StatsAccumulator } from './stats-accumulator';
import { getHeader, parseSender } from './gmail-parse';
import type { MessageMetadata } from './gmail-parse';
import type { GlobalStats, SenderStat, SizeStat, SubjectStat, StatsResult } from '../shared/types';

// ---------------------------------------------------------------------------
// Oracle: the previous batch implementation (full re-scan processors), kept
// verbatim so the incremental accumulator can be checked against it.
// ---------------------------------------------------------------------------

function processUnreadSenders(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SenderStat> {
  const now = Date.now();
  const senderCounts = new Map<string, { name: string; count: number; unsubscribeUrl?: string; firstDate: number; lastDate: number; ids: string[] }>();
  for (const m of messages) {
    const from = getHeader(m, 'From');
    if (!from) continue;
    const { name, email } = parseSender(from);
    if (!email) continue;
    const date = new Date(getHeader(m, 'Date') || now).getTime();
    const unsub = getHeader(m, 'List-Unsubscribe');
    const unsubUrl = unsub?.match(/<(https?:\/\/[^>]+)>/)?.[1];
    const existing = senderCounts.get(email);
    if (existing) {
      existing.count++;
      existing.ids.push(m.id);
      if (!existing.unsubscribeUrl) existing.unsubscribeUrl = unsubUrl;
      existing.firstDate = Math.min(existing.firstDate, date);
      existing.lastDate = Math.max(existing.lastDate, date);
    } else {
      senderCounts.set(email, { name, count: 1, unsubscribeUrl: unsubUrl, firstDate: date, lastDate: date, ids: [m.id] });
    }
  }
  const items = [...senderCounts.entries()]
    .map(([email, s]) => {
      const days = Math.max(1, (s.lastDate - s.firstDate) / 86400000);
      const score = (s.count / days) * ((now - s.lastDate) < 604800000 ? 2 : 1) * Math.log10(s.count + 1);
      return { sender: s.name || email, email, count: s.count, unsubscribeUrl: s.unsubscribeUrl, score, ids: s.ids };
    })
    .sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processHeaviest(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SizeStat> {
  const items = messages
    .filter(m => !!m.id)
    .map(m => ({
      id: m.id,
      subject: getHeader(m, 'Subject') || '(no subject)',
      from: getHeader(m, 'From') || '(unknown)',
      sizeEstimate: m.sizeEstimate || 0
    }))
    .sort((a, b) => b.sizeEstimate - a.sizeEstimate);
  return { items, totalFetched, errorCount };
}

function processRepeatedSubjects(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const counts = new Map<string, { count: number; ids: string[] }>();
  for (const m of messages) {
    const s = getHeader(m, 'Subject') || '(no subject)';
    const agg = counts.get(s);
    if (agg) { agg.count++; agg.ids.push(m.id); } else { counts.set(s, { count: 1, ids: [m.id] }); }
  }
  const items = [...counts.entries()].filter(([, agg]) => agg.count > 2).map(([subject, agg]) => ({ subject, count: agg.count, ids: agg.ids })).sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processOTPs(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const otpPatterns = [/code/i, /otp/i, /verification/i, /votre mot de passe/i, /sécurité/i, /security/i];
  const items = messages
    .filter(m => {
      const s = getHeader(m, 'Subject') || '';
      const date = new Date(getHeader(m, 'Date')).getTime();
      return otpPatterns.some(p => p.test(s)) && (Date.now() - date > 86400000);
    })
    .map(m => ({ subject: getHeader(m, 'Subject'), count: 1, ids: [m.id] }));
  return { items, totalFetched, errorCount };
}

function processParcels(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const parcelPatterns = [/colis/i, /livraison/i, /delivery/i, /shipping/i, /expédition/i, /command/i, /order/i, /envoyé/i];
  const counts = new Map<string, { count: number; ids: string[] }>();
  for (const m of messages) {
    const s = getHeader(m, 'Subject') || '';
    if (parcelPatterns.some(p => p.test(s))) {
      const generic = s.replace(/\S*\d\S*/g, '#').replace(/#+/g, '#').replace(/\s+/g, ' ').trim();
      const agg = counts.get(generic);
      if (agg) { agg.count++; agg.ids.push(m.id); } else { counts.set(generic, { count: 1, ids: [m.id] }); }
    }
  }
  const items = [...counts.entries()].map(([subject, agg]) => ({ subject, count: agg.count, ids: agg.ids })).sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processOld(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const items = messages.map(m => ({ subject: getHeader(m, 'Subject'), count: 1, ids: [m.id] }));
  return { items, totalFetched, errorCount };
}

function processInvites(inviteMsgs: MessageMetadata[], allMessages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const inviteRegex = /invite\.ics|google calendar/i;
  const items = allMessages
    .filter(m => {
      const s = getHeader(m, 'Subject') || '';
      const date = new Date(getHeader(m, 'Date')).getTime();
      return (inviteRegex.test(s) || (inviteMsgs.some(im => im.id === m.id))) && (Date.now() - date > 86400000 * 7);
    })
    .map(m => ({ subject: getHeader(m, 'Subject'), count: 1, ids: [m.id] }));
  return { items, totalFetched, errorCount };
}

function processRedundant(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SubjectStat> {
  const threadCounts = new Map<string, { subject: string; count: number; ids: string[] }>();
  for (const m of messages) {
    const tid = m.threadId || m.id;
    const t = threadCounts.get(tid);
    if (t) { t.count++; t.ids.push(m.id); } else { threadCounts.set(tid, { subject: getHeader(m, 'Subject'), count: 1, ids: [m.id] }); }
  }
  const items = [...threadCounts.values()].filter(t => t.count > 3).map(t => ({ subject: t.subject, count: t.count, ids: t.ids })).sort((a, b) => b.count - a.count);
  return { items, totalFetched, errorCount };
}

function processOldest(messages: MessageMetadata[], totalFetched: number, errorCount: number): StatsResult<SizeStat> {
  const items = messages
    .map(m => ({
      id: m.id,
      subject: getHeader(m, 'Subject') || '(no subject)',
      from: getHeader(m, 'From'),
      sizeEstimate: new Date(getHeader(m, 'Date')).getTime(),
      snippet: m.snippet
    }))
    .sort((a, b) => a.sizeEstimate - b.sizeEstimate);
  return { items, totalFetched, errorCount };
}

function oracleStats(
  msgs: MessageMetadata[],
  sets: { unread: Set<string>; heavy: Set<string>; old: Set<string>; invite: Set<string> },
  fetchedCount: number,
  errors: number,
): GlobalStats {
  const filter = (idSet: Set<string>): MessageMetadata[] => msgs.filter(m => idSet.has(m.id));
  return {
    unreadSenders: processUnreadSenders(filter(sets.unread), fetchedCount, errors),
    heaviestEmails: processHeaviest(filter(sets.heavy), fetchedCount, errors),
    repeatedSubjects: processRepeatedSubjects(msgs, fetchedCount, errors),
    expiredOTPs: processOTPs(msgs, fetchedCount, errors),
    parcelNotifications: processParcels(msgs, fetchedCount, errors),
    oldEmails: processOld(filter(sets.old), fetchedCount, errors),
    pastInvites: processInvites(filter(sets.invite), msgs, fetchedCount, errors),
    redundantThreads: processRedundant(msgs, fetchedCount, errors),
    oldestEmails: processOldest(msgs, fetchedCount, errors),
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

let seq = 0;
function fixtureMsg(opts: {
  from?: string;
  subject?: string;
  daysAgo?: number;
  size?: number;
  threadId?: string;
  unsubscribe?: string;
}): MessageMetadata {
  const id = `m${++seq}`;
  const headers: { name: string; value: string }[] = [];
  if (opts.from) headers.push({ name: 'From', value: opts.from });
  if (opts.subject !== undefined) headers.push({ name: 'Subject', value: opts.subject });
  if (opts.daysAgo !== undefined) {
    headers.push({ name: 'Date', value: new Date(Date.now() - opts.daysAgo * 86400000).toUTCString() });
  }
  if (opts.unsubscribe) headers.push({ name: 'List-Unsubscribe', value: opts.unsubscribe });
  return {
    id,
    threadId: opts.threadId,
    sizeEstimate: opts.size ?? 1000,
    snippet: `snippet-${id}`,
    payload: { headers },
  };
}

function buildFixtures() {
  seq = 0;
  const newsletter = Array.from({ length: 5 }, (_, i) =>
    fixtureMsg({
      from: 'News <news@letter.com>',
      subject: 'Weekly digest',
      daysAgo: 30 - i,
      unsubscribe: '<https://letter.com/unsub>',
    }),
  );
  const otp = fixtureMsg({ from: 'Auth <auth@x.com>', subject: 'Your verification code', daysAgo: 3 });
  const otpFresh = fixtureMsg({ from: 'Auth <auth@x.com>', subject: 'Your verification code', daysAgo: 0 });
  const parcel1 = fixtureMsg({ from: 'Ship <ship@x.com>', subject: 'Colis 12345 expédié', daysAgo: 10 });
  const parcel2 = fixtureMsg({ from: 'Ship <ship@x.com>', subject: 'Colis 99999 expédié', daysAgo: 9 });
  const heavy = fixtureMsg({ from: 'Big <big@x.com>', subject: 'Attachment', daysAgo: 5, size: 5_000_000 });
  const old = fixtureMsg({ from: 'Old <old@x.com>', subject: 'Ancient news', daysAgo: 400 });
  const invite = fixtureMsg({ from: 'Cal <cal@x.com>', subject: 'invite.ics: Meeting', daysAgo: 30 });
  const thread = Array.from({ length: 4 }, (_, i) =>
    fixtureMsg({ from: `T <t${i}@x.com>`, subject: 'Long thread', daysAgo: 2, threadId: 'thread-1' }),
  );

  const all = [...newsletter, otp, otpFresh, parcel1, parcel2, heavy, old, invite, ...thread];
  const sets = {
    unread: new Set(newsletter.map(m => m.id)),
    heavy: new Set([heavy.id]),
    old: new Set([old.id]),
    invite: new Set([invite.id]),
  };
  return { all, sets };
}

// ---------------------------------------------------------------------------

describe('StatsAccumulator', () => {
  it('matches the batch oracle when fed incrementally', () => {
    const { all, sets } = buildFixtures();
    const acc = new StatsAccumulator(sets.unread, sets.heavy, sets.old, sets.invite);

    // Feed in three uneven batches, like the real crawl does.
    acc.add(all.slice(0, 4));
    acc.add(all.slice(4, 11));
    acc.add(all.slice(11));

    const snapshot = acc.snapshot(all.length, 0);
    const oracle = oracleStats(all, sets, all.length, 0);

    // Scores involve Date.now() — compare them with tolerance, the rest exactly.
    const { unreadSenders: snapSenders, ...snapRest } = snapshot;
    const { unreadSenders: oracleSenders, ...oracleRest } = oracle;
    expect(snapRest).toEqual(oracleRest);
    expect(snapSenders.items.length).toBe(oracleSenders.items.length);
    snapSenders.items.forEach((item, i) => {
      const expected = oracleSenders.items[i];
      expect({ ...item, score: undefined }).toEqual({ ...expected, score: undefined });
      expect(item.score).toBeCloseTo(expected.score as number, 6);
    });
  });

  it('produces identical results regardless of batch slicing', () => {
    const { all, sets } = buildFixtures();

    const accOneShot = new StatsAccumulator(sets.unread, sets.heavy, sets.old, sets.invite);
    accOneShot.add(all);

    const accPerMessage = new StatsAccumulator(sets.unread, sets.heavy, sets.old, sets.invite);
    for (const m of all) accPerMessage.add([m]);

    const a = accOneShot.snapshot(all.length, 0);
    const b = accPerMessage.snapshot(all.length, 0);
    expect(JSON.parse(JSON.stringify(a))).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('carries totalFetched and errorCount into every result', () => {
    const { all, sets } = buildFixtures();
    const acc = new StatsAccumulator(sets.unread, sets.heavy, sets.old, sets.invite);
    acc.add(all);
    const snapshot = acc.snapshot(42, 7);
    for (const result of Object.values(snapshot)) {
      expect(result.totalFetched).toBe(42);
      expect(result.errorCount).toBe(7);
    }
  });

  it('skips messages without an id', () => {
    const acc = new StatsAccumulator(new Set(), new Set(), new Set(), new Set());
    acc.add([{ id: '', sizeEstimate: 1, payload: { headers: [] } }]);
    expect(acc.snapshot(0, 0).oldestEmails.items).toEqual([]);
  });

  it('collects the exact underlying message ids per aggregate', () => {
    const { all, sets } = buildFixtures();
    const acc = new StatsAccumulator(sets.unread, sets.heavy, sets.old, sets.invite);
    acc.add(all);
    const snapshot = acc.snapshot(all.length, 0);

    // Newsletter sender aggregates exactly the 5 unread newsletter ids.
    const newsSender = snapshot.unreadSenders.items.find(s => s.email === 'news@letter.com');
    expect(newsSender?.ids?.slice().sort()).toEqual([...sets.unread].sort());

    // Parcel group merges both colis fixtures under one generic subject.
    expect(snapshot.parcelNotifications.items[0].ids).toHaveLength(2);

    // Redundant thread carries all 4 thread message ids.
    expect(snapshot.redundantThreads.items[0].ids).toHaveLength(4);

    // Every OTP/old/invite item points at exactly one message.
    for (const item of [
      ...snapshot.expiredOTPs.items,
      ...snapshot.oldEmails.items,
      ...snapshot.pastInvites.items,
    ]) {
      expect(item.ids).toHaveLength(1);
    }
  });
});
