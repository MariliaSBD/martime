import type { Task } from '@/db/types';

type Item = Pick<Task, 'kind' | 'plannedMinutes' | 'status' | 'eventStatus' | 'reorganizedOn' | 'date'>;

/** 5.6 weight: task = planned minutes (30 if none); event = 30 whatever its length. */
export function itemWeight(t: Item): number {
  if (t.kind === 'event') return 30;
  return t.plannedMinutes > 0 ? t.plannedMinutes : 30;
}

/** 5.6 credit: 1, 0 or null when the item leaves the calculation. */
export function itemCredit(t: Item): number | null {
  if (t.kind === 'event') {
    if (t.eventStatus === 'cancelled_other') return null;
    return t.eventStatus === 'ontime' || t.eventStatus === 'late' ? 1 : 0;
  }
  if ((t.status === 'delegated' || t.status === 'refused') && t.reorganizedOn && t.reorganizedOn === t.date) return null;
  return t.status === 'done' ? 1 : 0;
}

export interface ProgressSums {
  done: number;
  total: number;
  pct: number | null;
}

export function progressOf(items: Item[]): ProgressSums {
  let done = 0;
  let total = 0;
  for (const it of items) {
    const c = itemCredit(it);
    if (c === null) continue;
    const w = itemWeight(it);
    total += w;
    done += w * c;
  }
  return { done, total, pct: total ? Math.round((done / total) * 100) : null };
}

/** Week, month or year: sum of weighted credits over sum of weights (not the average of percentages). */
export function combine(days: { done: number; total: number }[]): ProgressSums {
  const done = days.reduce((s, d) => s + d.done, 0);
  const total = days.reduce((s, d) => s + d.total, 0);
  return { done, total, pct: total ? Math.round((done / total) * 100) : null };
}
