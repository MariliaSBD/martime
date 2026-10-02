// 5.14 Silence. Dependency-free except ../time: this file is also copied into the Edge Functions (Deno).
import { addDays, atLocal, dateKey, hhmmToMinutes, localMinutes, toDate } from '../time';

export interface SilenceDay {
  startedAt: string;
  endedAt: string | null;
}

export interface SilenceContext {
  days: SilenceDay[];
  /** with "Horário fixo": silence between the sleep and wake targets */
  fixed: { wake: string; sleep: string } | null;
}

/** Types kept during silence and delivered later ("Enquanto descansavas"). */
export const DEFERRABLE = new Set(['deadline', 'importantDate', 'weeklyReview']);

export function inSilence(at: string, ctx: SilenceContext): boolean {
  if (ctx.fixed) {
    const m = localMinutes(at);
    const s = hhmmToMinutes(ctx.fixed.sleep);
    const w = hhmmToMinutes(ctx.fixed.wake);
    return s <= w ? m >= s && m < w : m >= s || m < w;
  }
  const t = toDate(at).getTime();
  let latest: SilenceDay | null = null;
  for (const d of ctx.days) {
    if (toDate(d.startedAt).getTime() <= t && (!latest || d.startedAt > latest.startedAt)) latest = d;
  }
  return !!latest?.endedAt && toDate(latest.endedAt).getTime() <= t;
}

export type Decision = 'send' | 'defer' | 'drop';

export function decide(type: string, at: string, ctx: SilenceContext): Decision {
  if (!inSilence(at, ctx)) return 'send';
  return DEFERRABLE.has(type) ? 'defer' : 'drop';
}

/** First 11:00 (Lisbon) strictly after the instant. */
export function next11(after: string): string {
  const k = dateKey(after);
  const same = atLocal(k, '11:00');
  return (same.getTime() > toDate(after).getTime() ? same : atLocal(addDays(k, 1), '11:00')).toISOString();
}

/**
 * Deferred reminders are released in one notification when the day starts (silence over),
 * or at 11:00 if the day has not started by then.
 */
export function shouldRelease(deferredSince: string, now: string, ctx: SilenceContext): boolean {
  if (!inSilence(now, ctx)) return true;
  if (ctx.fixed) return false;
  return toDate(now).getTime() >= toDate(next11(deferredSince)).getTime();
}
