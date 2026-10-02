import type { Decision, EnergyBlock, Settings, Task } from '@/db/types';
import { addDays, atLocal, dateKey, hhmmToMinutes, minutesBetween, toDate, type DateKey } from '../time';
import { sortedBlocks } from './energy';

/** 11.2: suggested approach from impact and reversibility. */
export function suggestApproach(impact: Decision['impact'], reversibility: Decision['reversibility']): Decision['approach'] {
  if (impact === 'low' && reversibility === 'easy') return 'fast';
  if (impact === 'high' && reversibility === 'hard') return 'advice';
  return 'data';
}

/**
 * 7 (6): time available from now until the sleep target; without it, until the end of the last energy block;
 * null when neither exists (the app asks).
 */
export function availableMinutes(now: string, day: DateKey, settings: Pick<Settings, 'sleepTarget'>, blocks: EnergyBlock[]): number | null {
  let until: Date | null = null;
  if (settings.sleepTarget) {
    // a target after midnight but before noon belongs to the night of this day
    const next = hhmmToMinutes(settings.sleepTarget) < 12 * 60 ? addDays(day, 1) : day;
    until = atLocal(next, settings.sleepTarget);
  } else {
    const live = sortedBlocks(blocks);
    if (live.length) until = atLocal(day, live[live.length - 1].end === '24:00' ? '23:59' : live.reduce((m, b) => (b.end > m ? b.end : m), '00:00'));
  }
  if (!until) return null;
  return Math.max(0, Math.round(minutesBetween(now, until)));
}

/** Planned minutes of the tasks still to do (minus what was already done on them). */
export function neededMinutes(items: Task[], realOf: (t: Task) => number | null): number {
  return items.filter((t) => t.kind === 'task' && !t.deleted_at && t.status === 'pending').reduce((s, t) => s + Math.max(0, (t.plannedMinutes || 30) - (realOf(t) ?? 0)), 0);
}

/** "Este dia começou há mais de 20 horas". */
export function dayTooLong(startedAt: string, now: string): boolean {
  return minutesBetween(startedAt, now) > 20 * 60;
}

/** Suggested end of a forgotten day: end of the last time entry or of the last completed task. */
export function suggestedEnd(startedAt: string, entryEnds: (string | null)[], completed: (string | null)[], now: string): string {
  const all = [...entryEnds, ...completed].filter((x): x is string => !!x && x >= startedAt && x <= now);
  return all.length ? all.reduce((m, x) => (x > m ? x : m)) : startedAt;
}

export function isBetween(at: string, from: string, to: string): boolean {
  const t = toDate(at).getTime();
  return t >= toDate(from).getTime() && t <= toDate(to).getTime();
}

/** Cheguei visible from 30 minutes before the start until the end. */
export function canArrive(ev: Pick<Task, 'date' | 'plannedStart' | 'plannedEnd' | 'arrivedAt' | 'eventStatus'>, now: string): boolean {
  if (!ev.date || !ev.plannedStart || ev.arrivedAt || ev.eventStatus) return false;
  const s = atLocal(ev.date, ev.plannedStart).getTime() - 30 * 60000;
  const e = ev.plannedEnd ? atLocal(ev.date, ev.plannedEnd).getTime() : atLocal(ev.date, ev.plannedStart).getTime() + 60 * 60000;
  const t = toDate(now).getTime();
  return t >= s && t <= e;
}

/** Event over without arrival or status → ask "Como correu". */
export function needsOutcome(ev: Pick<Task, 'kind' | 'date' | 'plannedStart' | 'plannedEnd' | 'arrivedAt' | 'eventStatus' | 'deleted_at'>, now: string): boolean {
  if (ev.kind !== 'event' || ev.deleted_at || ev.eventStatus || ev.arrivedAt || !ev.date || !ev.plannedEnd) return false;
  return toDate(now).getTime() >= atLocal(ev.date, ev.plannedEnd).getTime();
}

export function todayKey(now: string): DateKey {
  return dateKey(now);
}
