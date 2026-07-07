/**
 * Incremental stats aggregation over the metadata crawl.
 *
 * Messages are parsed once when their batch lands (`add`) and folded into
 * small per-category aggregates; `snapshot()` only sorts those aggregates.
 * This replaces the previous approach of re-scanning and re-sorting the
 * entire raw message list on every progress tick (O(n²) over a crawl).
 *
 * Every aggregate also collects the underlying message ids so the UI can
 * trash exactly the messages behind a row without round-tripping through
 * Gmail query syntax.
 */
import type { GlobalStats, SenderStat, SizeStat, SubjectStat, StatsResult } from '../shared/types';
import { allOtpPatterns, allParcelPatterns, allInvitePatterns } from '../shared/locale-patterns';
import { genericizeSubject, parseMessage, parseSender } from './gmail-parse';
import type { MessageMetadata, ParsedMessage } from './gmail-parse';

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

interface SenderAgg {
  name: string;
  count: number;
  unsubscribeUrl?: string;
  firstDate: number;
  lastDate: number;
  ids: string[];
}

interface CountAgg {
  count: number;
  ids: string[];
}

export class StatsAccumulator {
  private readonly senders = new Map<string, SenderAgg>();
  private readonly subjectCounts = new Map<string, CountAgg>();
  private readonly parcelCounts = new Map<string, CountAgg>();
  private readonly threadCounts = new Map<string, { subject: string; count: number; ids: string[] }>();
  private readonly otpItems: SubjectStat[] = [];
  private readonly oldItems: SubjectStat[] = [];
  private readonly inviteItems: SubjectStat[] = [];
  private readonly heavyItems: SizeStat[] = [];
  private readonly oldestItems: SizeStat[] = [];

  constructor(
    private readonly unreadSet: Set<string>,
    private readonly heavySet: Set<string>,
    private readonly oldSet: Set<string>,
    private readonly inviteSet: Set<string>,
  ) {}

  add(batch: MessageMetadata[]): void {
    this.addParsed(batch.filter(raw => !!raw.id).map(parseMessage));
  }

  addParsed(batch: ParsedMessage[]): void {
    const now = Date.now();
    for (const m of batch) {
      if (!m.id) continue;
      const subject = m.subject;
      const subjectOrNone = subject || '(no subject)';

      // Repeated subjects (all messages)
      const subjAgg = this.subjectCounts.get(subjectOrNone);
      if (subjAgg) {
        subjAgg.count++;
        subjAgg.ids.push(m.id);
      } else {
        this.subjectCounts.set(subjectOrNone, { count: 1, ids: [m.id] });
      }

      // Redundant threads (all messages)
      const t = this.threadCounts.get(m.threadId);
      if (t) {
        t.count++;
        t.ids.push(m.id);
      } else {
        this.threadCounts.set(m.threadId, { subject, count: 1, ids: [m.id] });
      }

      // Expired OTPs (all messages, older than 24h)
      if (allOtpPatterns.some(p => p.test(subject)) && now - m.dateMs > DAY_MS) {
        this.otpItems.push({ subject, count: 1, ids: [m.id] });
      }

      // Parcel notifications (all messages, grouped by genericized subject)
      if (allParcelPatterns.some(p => p.test(subject))) {
        const generic = genericizeSubject(subject);
        const parcelAgg = this.parcelCounts.get(generic);
        if (parcelAgg) {
          parcelAgg.count++;
          parcelAgg.ids.push(m.id);
        } else {
          this.parcelCounts.set(generic, { count: 1, ids: [m.id] });
        }
      }

      // Past invites (subject pattern or invite query hit, older than 7 days)
      if (
        (allInvitePatterns.some(p => p.test(subject)) || this.inviteSet.has(m.id)) &&
        now - m.dateMs > WEEK_MS
      ) {
        this.inviteItems.push({ subject, count: 1, ids: [m.id] });
      }

      // Oldest emails (all messages; sizeEstimate carries the date for the UI)
      this.oldestItems.push({
        id: m.id,
        subject: subjectOrNone,
        from: m.from,
        sizeEstimate: m.dateMs,
        snippet: m.snippet,
      });

      // Unread senders
      if (this.unreadSet.has(m.id) && m.from) {
        const { name, email } = parseSender(m.from);
        if (email) {
          const date = Number.isNaN(m.dateMs) ? now : m.dateMs;
          const existing = this.senders.get(email);
          if (existing) {
            existing.count++;
            existing.ids.push(m.id);
            if (!existing.unsubscribeUrl) existing.unsubscribeUrl = m.unsubscribeUrl;
            existing.firstDate = Math.min(existing.firstDate, date);
            existing.lastDate = Math.max(existing.lastDate, date);
          } else {
            this.senders.set(email, {
              name,
              count: 1,
              unsubscribeUrl: m.unsubscribeUrl,
              firstDate: date,
              lastDate: date,
              ids: [m.id],
            });
          }
        }
      }

      // Heaviest emails
      if (this.heavySet.has(m.id)) {
        this.heavyItems.push({
          id: m.id,
          subject: subjectOrNone,
          from: m.from || '(unknown)',
          sizeEstimate: m.sizeEstimate,
        });
      }

      // Old emails
      if (this.oldSet.has(m.id)) {
        this.oldItems.push({ subject, count: 1, ids: [m.id] });
      }
    }
  }

  snapshot(totalFetched: number, errorCount: number): GlobalStats {
    const now = Date.now();
    const wrap = <T>(items: T[]): StatsResult<T> => ({ items, totalFetched, errorCount });

    const unreadSenders: SenderStat[] = [...this.senders.entries()]
      .map(([email, s]) => {
        const days = Math.max(1, (s.lastDate - s.firstDate) / DAY_MS);
        const score =
          (s.count / days) * (now - s.lastDate < WEEK_MS ? 2 : 1) * Math.log10(s.count + 1);
        return {
          sender: s.name || email,
          email,
          count: s.count,
          unsubscribeUrl: s.unsubscribeUrl,
          score,
          ids: s.ids,
        };
      })
      .sort((a, b) => b.count - a.count);

    return {
      unreadSenders: wrap(unreadSenders),
      heaviestEmails: wrap([...this.heavyItems].sort((a, b) => b.sizeEstimate - a.sizeEstimate)),
      repeatedSubjects: wrap(
        [...this.subjectCounts.entries()]
          .filter(([, agg]) => agg.count > 2)
          .map(([subject, agg]) => ({ subject, count: agg.count, ids: agg.ids }))
          .sort((a, b) => b.count - a.count),
      ),
      expiredOTPs: wrap([...this.otpItems]),
      parcelNotifications: wrap(
        [...this.parcelCounts.entries()]
          .map(([subject, agg]) => ({ subject, count: agg.count, ids: agg.ids }))
          .sort((a, b) => b.count - a.count),
      ),
      oldEmails: wrap([...this.oldItems]),
      pastInvites: wrap([...this.inviteItems]),
      redundantThreads: wrap(
        [...this.threadCounts.values()]
          .filter(t => t.count > 3)
          .map(t => ({ subject: t.subject, count: t.count, ids: t.ids }))
          .sort((a, b) => b.count - a.count),
      ),
      oldestEmails: wrap([...this.oldestItems].sort((a, b) => a.sizeEstimate - b.sizeEstimate)),
    };
  }
}
