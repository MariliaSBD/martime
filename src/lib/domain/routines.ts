import type { Task, TimeEntry } from '@/db/types';
import { addDays, dateKey, diffDays, weekStart, type DateKey } from '../time';
import { isSeries, occurrenceDates } from './recurrence';
import { normalizeName } from './timeEntries';

export interface RoutineStats {
  planned: number;
  done: number;
  pct: number | null;
  streak: number;
}

/** 5.9: adherence = occurrences done / occurrences planned until today; streak = consecutive done occurrences. */
export function routineStats(series: Task, all: Task[], today: DateKey, from?: DateKey): RoutineStats {
  const start = from && from > series.date! ? from : series.date!;
  const dates = occurrenceDates(series.repeat!, series.date!, start, today);
  const occ = new Map(all.filter((t) => t.seriesId === series.id).map((t) => [t.occurrenceDate!, t]));
  const isDone = (d: DateKey) => occ.get(d)?.status === 'done' && !occ.get(d)?.deleted_at;
  const skipped = (d: DateKey) => !!occ.get(d)?.deleted_at;
  const counted = dates.filter((d) => !skipped(d));
  const done = counted.filter(isDone).length;
  let streak = 0;
  const all2 = occurrenceDates(series.repeat!, series.date!, series.date!, today).filter((d) => !skipped(d));
  for (let i = all2.length - 1; i >= 0; i--) {
    const d = all2[i];
    if (isDone(d)) streak++;
    else if (d === today) continue; // today may still be done
    else break;
  }
  return { planned: counted.length, done, pct: counted.length ? Math.round((done / counted.length) * 100) : null, streak };
}

export const routineKey = (name: string, areaId: string | null) => `${normalizeName(name)}|${areaId ?? ''}`;

/**
 * 5.15: same name and area done or logged at least 3 times a week (distinct days) for 2 weeks in a row,
 * not yet a routine, not dismissed in the last 30 days.
 */
export function suggestRoutine(tasks: Task[], entries: TimeEntry[], now: string, dismissed: Record<string, string>): { name: string; areaId: string | null; key: string } | null {
  const today = dateKey(now);
  const w0 = weekStart(today);
  const weeks = [addDays(w0, -14), addDays(w0, -7), w0];
  const routines = new Set(tasks.filter((t) => isSeries(t) && !t.deleted_at).map((t) => routineKey(t.title, t.areaId)));
  const days = new Map<string, { name: string; areaId: string | null; days: Set<DateKey> }>();
  const add = (name: string, areaId: string | null, at: string) => {
    const k = routineKey(name, areaId);
    const cur = days.get(k) ?? { name: name.trim(), areaId, days: new Set<DateKey>() };
    cur.days.add(dateKey(at));
    days.set(k, cur);
  };
  for (const t of tasks) if (!t.deleted_at && t.status === 'done' && t.completedAt && !t.seriesId) add(t.title, t.areaId, t.completedAt);
  for (const e of entries) if (!e.deleted_at && (e.source === 'free' || e.source === 'manual')) add(e.activity, e.areaId, e.start);
  const perWeek = (s: Set<DateKey>, w: DateKey) => [...s].filter((d) => d >= w && d < addDays(w, 7)).length;
  for (const [k, v] of days) {
    if (routines.has(k)) continue;
    if (dismissed[k] && diffDays(dateKey(dismissed[k]), today) < 30) continue;
    const c = weeks.map((w) => perWeek(v.days, w));
    if ((c[0] >= 3 && c[1] >= 3) || (c[1] >= 3 && c[2] >= 3)) return { name: v.name, areaId: v.areaId, key: k };
  }
  return null;
}
