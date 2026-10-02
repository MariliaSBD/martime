import type { Classification, TimeEntry, Task } from '@/db/types';
import { minutesBetween, toDate } from '../time';

export type TimerState = 'idle' | 'running' | 'paused' | 'done';

export function entryMinutes(e: Pick<TimeEntry, 'start' | 'end'>, now: string): number {
  return Math.max(0, minutesBetween(e.start, e.end ?? now));
}

/** Timer intervals of a task (its "timer" time entries), oldest first. */
export function taskIntervals(taskId: string, entries: TimeEntry[]): TimeEntry[] {
  return entries.filter((e) => e.taskId === taskId && e.source === 'timer' && !e.deleted_at).sort((a, b) => (a.start < b.start ? -1 : 1));
}

export interface TaskTimer {
  state: TimerState;
  /** real minutes excluding pauses */
  realMinutes: number;
  firstStart: string | null;
  lastEnd: string | null;
  running: TimeEntry | null;
}

/** The timer is always computed from stored instants, never from an in-memory counter (4.10). */
export function taskTimer(task: Pick<Task, 'id' | 'status' | 'manualMinutes'>, entries: TimeEntry[], now: string): TaskTimer {
  const iv = taskIntervals(task.id, entries);
  const running = iv.find((e) => !e.end) ?? null;
  const fromIntervals = iv.reduce((s, e) => s + entryMinutes(e, now), 0);
  const realMinutes = iv.length ? fromIntervals : (task.manualMinutes ?? 0);
  const state: TimerState = task.status === 'done' ? 'done' : running ? 'running' : iv.length ? 'paused' : 'idle';
  return {
    state,
    realMinutes,
    firstStart: iv[0]?.start ?? null,
    lastEnd: iv.length ? (iv[iv.length - 1].end ?? null) : null,
    running,
  };
}

/** Real minutes of a task, or null when there is no real time. */
export function realMinutesOf(task: Pick<Task, 'id' | 'status' | 'manualMinutes'>, entries: TimeEntry[], now: string): number | null {
  const iv = taskIntervals(task.id, entries);
  if (iv.length) return iv.reduce((s, e) => s + entryMinutes(e, now), 0);
  return task.manualMinutes ?? null;
}

export interface Interval {
  start: string;
  end: string;
}

/** Intervals between from and to that no time entry covers (5.10 "Sem registo"). */
export function gaps(entries: Pick<TimeEntry, 'start' | 'end' | 'deleted_at'>[], from: string, to: string, now: string, minMinutes = 1): Interval[] {
  const f = toDate(from).getTime();
  const t = toDate(to).getTime();
  const spans = entries
    .filter((e) => !e.deleted_at)
    .map((e) => [Math.max(f, toDate(e.start).getTime()), Math.min(t, toDate(e.end ?? now).getTime())] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  let cur = f;
  for (const [a, b] of spans) {
    if (a > cur && (a - cur) / 60000 >= minMinutes) out.push({ start: new Date(cur).toISOString(), end: new Date(a).toISOString() });
    cur = Math.max(cur, b);
  }
  if (t > cur && (t - cur) / 60000 >= minMinutes) out.push({ start: new Date(cur).toISOString(), end: new Date(t).toISOString() });
  return out;
}

export function gapMinutes(entries: Pick<TimeEntry, 'start' | 'end' | 'deleted_at'>[], from: string, to: string, now: string): number {
  return gaps(entries, from, to, now).reduce((s, g) => s + minutesBetween(g.start, g.end), 0);
}

export interface OverlapChange {
  id: string;
  activity: string;
  kind: 'shortened' | 'removed';
  patch: Partial<TimeEntry>;
}

/** When an entry is edited to overlap others, the others are adjusted (5.10). */
export function resolveOverlaps(edited: Pick<TimeEntry, 'id' | 'start' | 'end'>, others: TimeEntry[], now: string): OverlapChange[] {
  const s = toDate(edited.start).getTime();
  const e = toDate(edited.end ?? now).getTime();
  const out: OverlapChange[] = [];
  for (const o of others) {
    if (o.id === edited.id || o.deleted_at) continue;
    const os = toDate(o.start).getTime();
    const oe = toDate(o.end ?? now).getTime();
    if (oe <= s || os >= e) continue;
    if (os >= s && oe <= e) out.push({ id: o.id, activity: o.activity, kind: 'removed', patch: { deleted_at: new Date(now).toISOString() } });
    else if (os < s) out.push({ id: o.id, activity: o.activity, kind: 'shortened', patch: { end: new Date(s).toISOString() } });
    else out.push({ id: o.id, activity: o.activity, kind: 'shortened', patch: { start: new Date(e).toISOString() } });
  }
  return out;
}

export const normalizeName = (s: string) => s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-PT');

export interface Slot {
  start: string;
  activity: string | null; // null = "Sem registo"
  classification: Classification | null;
  minutes: number;
}

/** 5.11: for each 30-minute slot, the activity with most minutes (tie: the one that started first). */
export function thirtyMinuteTable(entries: TimeEntry[], from: string, to: string, now: string): Slot[] {
  const out: Slot[] = [];
  const f = toDate(from).getTime();
  const t = toDate(to).getTime();
  const live = entries.filter((e) => !e.deleted_at);
  for (let a = f; a < t; a += 30 * 60000) {
    const b = Math.min(t, a + 30 * 60000);
    const by = new Map<string, { name: string; minutes: number; first: number; cls: Classification }>();
    let covered = 0;
    for (const e of live) {
      const es = Math.max(a, toDate(e.start).getTime());
      const ee = Math.min(b, toDate(e.end ?? now).getTime());
      if (ee <= es) continue;
      const m = (ee - es) / 60000;
      covered += m;
      const k = normalizeName(e.activity);
      const cur = by.get(k);
      const st = toDate(e.start).getTime();
      if (cur) {
        cur.minutes += m;
        cur.first = Math.min(cur.first, st);
      } else by.set(k, { name: e.activity, minutes: m, first: st, cls: e.classification });
    }
    const slotLen = (b - a) / 60000;
    if (covered * 2 <= slotLen) {
      out.push({ start: new Date(a).toISOString(), activity: null, classification: null, minutes: covered });
      continue;
    }
    const best = [...by.values()].sort((x, y) => y.minutes - x.minutes || x.first - y.first)[0];
    out.push({ start: new Date(a).toISOString(), activity: best.name, classification: best.cls, minutes: best.minutes });
  }
  return out;
}

export interface Thief {
  name: string;
  minutes: number;
}

/** 5.11: waste grouped by name (ignoring case and spaces), most minutes first. */
export function timeThieves(entries: TimeEntry[], now: string): Thief[] {
  const by = new Map<string, Thief>();
  for (const e of entries) {
    if (e.deleted_at || e.classification !== 'waste') continue;
    const k = normalizeName(e.activity);
    const cur = by.get(k) ?? { name: e.activity.trim().replace(/\s+/g, ' '), minutes: 0 };
    cur.minutes += entryMinutes(e, now);
    by.set(k, cur);
  }
  return [...by.values()].sort((a, b) => b.minutes - a.minutes);
}

export function minutesByClassification(entries: TimeEntry[], now: string, clipFrom?: string, clipTo?: string): Record<Classification, number> {
  const out: Record<Classification, number> = { essential: 0, useful: 0, waste: 0, travel: 0 };
  for (const e of entries) {
    if (e.deleted_at || e.source === 'sleep') continue;
    out[e.classification] += clippedMinutes(e, now, clipFrom, clipTo);
  }
  return out;
}

export function clippedMinutes(e: Pick<TimeEntry, 'start' | 'end'>, now: string, from?: string, to?: string): number {
  const s = Math.max(toDate(e.start).getTime(), from ? toDate(from).getTime() : -Infinity);
  const en = Math.min(toDate(e.end ?? now).getTime(), to ? toDate(to).getTime() : Infinity);
  return Math.max(0, (en - s) / 60000);
}
