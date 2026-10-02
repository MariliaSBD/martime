import type { Task, TimeEntry } from '@/db/types';
import { atLocal, minutesBetween } from '../time';
import { taskIntervals } from './timeEntries';

export interface PunctualityItem {
  id: string;
  title: string;
  /** minutes late (negative = early); null when unknown */
  late: number | null;
  onTime: boolean;
}

/** 5.7: tasks with a planned start that were started; events with an arrival or with status on time / late. */
export function punctualityItems(items: Task[], entries: TimeEntry[]): PunctualityItem[] {
  const out: PunctualityItem[] = [];
  for (const t of items) {
    if (t.deleted_at || !t.date || !t.plannedStart) continue;
    const planned = atLocal(t.date, t.plannedStart);
    if (t.kind === 'task') {
      const first = taskIntervals(t.id, entries)[0];
      if (!first) continue;
      const late = Math.round(minutesBetween(planned, first.start));
      out.push({ id: t.id, title: t.title, late, onTime: late <= 5 });
    } else if (t.arrivedAt) {
      const late = Math.round(minutesBetween(planned, t.arrivedAt));
      out.push({ id: t.id, title: t.title, late, onTime: late <= 5 });
    } else if (t.eventStatus === 'ontime' || t.eventStatus === 'late') {
      out.push({ id: t.id, title: t.title, late: null, onTime: t.eventStatus === 'ontime' });
    }
  }
  return out;
}

export interface PunctualityStats {
  count: number;
  onTimePct: number | null;
  /** average delay of the late items */
  avgLate: number | null;
}

export function punctualityStats(items: PunctualityItem[]): PunctualityStats {
  if (!items.length) return { count: 0, onTimePct: null, avgLate: null };
  const onTime = items.filter((i) => i.onTime).length;
  const late = items.filter((i) => !i.onTime && i.late !== null).map((i) => i.late!);
  return {
    count: items.length,
    onTimePct: Math.round((onTime / items.length) * 100),
    avgLate: late.length ? Math.round(late.reduce((s, x) => s + x, 0) / late.length) : null,
  };
}

/** Event status after "Cheguei": up to 5 minutes after the start is on time. */
export function arrivalStatus(date: string, plannedStart: string, arrivedAt: string): { status: 'ontime' | 'late'; late: number } {
  const late = Math.round(minutesBetween(atLocal(date, plannedStart), arrivedAt));
  return { status: late <= 5 ? 'ontime' : 'late', late: Math.max(0, late) };
}

/** 5.7 reliability: on time or late / events with a status, excluding those cancelled by the other person. */
export function reliability(events: Task[]): { pct: number | null; count: number } {
  const withStatus = events.filter((e) => e.kind === 'event' && !e.deleted_at && e.eventStatus && e.eventStatus !== 'cancelled_other');
  if (!withStatus.length) return { pct: null, count: 0 };
  const ok = withStatus.filter((e) => e.eventStatus === 'ontime' || e.eventStatus === 'late').length;
  return { pct: Math.round((ok / withStatus.length) * 100), count: withStatus.length };
}
