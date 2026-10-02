import { db } from '@/db/db';
import { create, undoable, update } from '@/db/repo';
import type { Day, Tip } from '@/db/types';
import { dateKey, nowIso } from '@/lib/time';
import { suggestedEnd } from '@/lib/domain/misc';
import i18n from '@/i18n';
import { runningEntries } from './tasks';

export async function liveDays(): Promise<Day[]> {
  return (await db.days.toArray()).filter((d) => !d.deleted_at).sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

export async function activeDay(): Promise<Day | undefined> {
  return (await liveDays()).filter((d) => !d.endedAt).pop();
}

/** Suggested end for a day left open: end of the last time entry or last completed task. */
export async function suggestedDayEnd(day: Day, now = nowIso()): Promise<string> {
  const entries = (await db.timeEntries.toArray()).filter((e) => !e.deleted_at && e.source !== 'sleep');
  const tasks = (await db.tasks.toArray()).filter((t) => !t.deleted_at);
  return suggestedEnd(
    day.startedAt,
    entries.map((e) => e.end),
    tasks.map((t) => t.completedAt),
    now,
  );
}

async function sleepAreaId(): Promise<string | null> {
  const areas = (await db.areas.toArray()).filter((a) => !a.deleted_at);
  const names = [i18n.t('areas.defaults.5', { lng: 'pt-PT' }), i18n.t('areas.defaults.5', { lng: 'en' })].map((n) => n.toLowerCase());
  return areas.find((a) => names.includes(a.name.toLowerCase()))?.id ?? null;
}

/** Começar o dia (5.1). A previous day still open must be ended first (`previousEnd`). */
export async function startDay(at = nowIso(), previousEnd?: string): Promise<{ day: Day; undo: () => Promise<void> }> {
  let day!: Day;
  const { undo } = await undoable(async () => {
    const open = await activeDay();
    if (open) await update('days', open.id, { endedAt: previousEnd ?? at });
    const days = await liveDays();
    const last = days.filter((d) => d.endedAt).sort((a, b) => (a.endedAt! < b.endedAt! ? -1 : 1)).pop();
    const key = dateKey(at);
    const same = days.find((d) => d.date === key);
    if (same && same.id !== open?.id) {
      day = (await update('days', same.id, { endedAt: null, frozen: null }))!;
    } else if (same) {
      day = (await update('days', same.id, { endedAt: null, frozen: null }))!;
    } else {
      day = await create('days', { date: key, startedAt: at, endedAt: null, frozen: null, feeling: null, tip: null });
    }
    // 5.1 (6): the gap between Terminar o dia and Começar o dia is sleep
    if (last?.endedAt && last.endedAt < at && !same) {
      await create('timeEntries', { start: last.endedAt, end: at, activity: i18n.t('today.sleep'), areaId: await sleepAreaId(), classification: 'essential', taskId: null, locationId: null, source: 'sleep' });
    }
  });
  return { day, undo };
}

/** Terminar o dia: records the time and freezes the progress (5.6). */
export async function endDay(id: string, at: string, frozen: Day['frozen'], tip: Tip | null, feeling: number | null): Promise<void> {
  for (const e of await runningEntries()) if (e.source === 'free') await update('timeEntries', e.id, { end: at });
  await update('days', id, { endedAt: at, frozen, tip, feeling });
}
