import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Area, Day, EnergyBlock, LogSession, Place, Task, TimeEntry } from '@/db/types';
import { expandItems } from '@/lib/domain/recurrence';
import { progressOf } from '@/lib/domain/progress';
import { realMinutesOf } from '@/lib/domain/timeEntries';
import { dateKey } from '@/lib/time';

export interface DayData {
  raw: Task[];
  entries: TimeEntry[];
  days: Day[];
  areas: Area[];
  blocks: EnergyBlock[];
  places: Place[];
  sessions: LogSession[];
}

export function useDayData(): DayData | undefined {
  return useLiveQuery(async () => {
    const [raw, entries, days, areas, blocks, places, sessions] = await Promise.all([
      db.tasks.toArray(),
      db.timeEntries.toArray(),
      db.days.toArray(),
      db.areas.toArray(),
      db.energyBlocks.toArray(),
      db.places.toArray(),
      db.sessions.toArray(),
    ]);
    const live = <T extends { deleted_at: string | null }>(xs: T[]) => xs.filter((x) => !x.deleted_at);
    return {
      raw,
      entries: live(entries),
      days: live(days).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1)),
      areas: live(areas).sort((a, b) => a.order - b.order),
      blocks: live(blocks),
      places: live(places),
      sessions: live(sessions),
    };
  }, []);
}

export function activeDayOf(days: Day[]): Day | undefined {
  return days.filter((d) => !d.endedAt).pop();
}

/** The date shown in Hoje: the active day (even after midnight) or today. */
export function shownDate(days: Day[], now: string): string {
  return activeDayOf(days)?.date ?? dateKey(now);
}

export function dayItems(d: DayData, date: string): Task[] {
  return expandItems(d.raw, date, date);
}

/** Progress of a day: frozen when the day was ended, otherwise from the current data. */
export function dayProgress(d: DayData, date: string) {
  const day = d.days.find((x) => x.date === date && x.endedAt && x.frozen);
  if (day?.frozen) return day.frozen;
  return progressOf(dayItems(d, date));
}

export function plannedAndReal(items: Task[], entries: TimeEntry[], now: string): { planned: number; real: number } {
  let planned = 0;
  let real = 0;
  for (const t of items) {
    if (t.kind === 'task') {
      planned += t.plannedMinutes || 30;
      real += realMinutesOf(t, entries, now) ?? 0;
    } else {
      planned += t.plannedMinutes || 30;
      if (t.eventStatus === 'ontime' || t.eventStatus === 'late') real += t.plannedMinutes || 30;
    }
  }
  return { planned, real };
}
