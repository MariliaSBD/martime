import { db } from '@/db/db';
import { create, undoable, update } from '@/db/repo';
import type { Classification, LogSession, TimeEntry } from '@/db/types';
import { resolveOverlaps, type OverlapChange } from '@/lib/domain/timeEntries';
import { nowIso } from '@/lib/time';
import { runningEntries } from './tasks';

/** Registo livre: ends whatever is running now and starts the new activity (5.10). */
export async function startFree(activity: string, areaId: string | null, classification: Classification, at = nowIso()): Promise<{ undo: () => Promise<void>; stopped: string | null }> {
  let stopped: string | null = null;
  const { undo } = await undoable(async () => {
    for (const e of await runningEntries()) {
      await update('timeEntries', e.id, { end: at });
      stopped = e.activity;
    }
    await create('timeEntries', { start: at, end: null, activity: activity.trim(), areaId, classification, taskId: null, locationId: null, source: 'free' });
  });
  return { undo, stopped };
}

export async function stopFree(id: string, at = nowIso()): Promise<void> {
  await update('timeEntries', id, { end: at });
}

/** Saves an entry and adjusts the ones it overlaps. Returns the changes for the notice. */
export async function saveEntry(e: Partial<TimeEntry> & { start: string; end: string | null }, id?: string): Promise<{ changes: OverlapChange[]; undo: () => Promise<void> }> {
  let changes: OverlapChange[] = [];
  const { undo } = await undoable(async () => {
    const all = (await db.timeEntries.toArray()).filter((x) => !x.deleted_at);
    const now = nowIso();
    changes = resolveOverlaps({ id: id ?? '', start: e.start, end: e.end ?? now }, all, now);
    for (const c of changes) await update('timeEntries', c.id, c.patch);
    if (id) await update('timeEntries', id, e);
    else
      await create('timeEntries', {
        activity: e.activity ?? '',
        areaId: e.areaId ?? null,
        classification: e.classification ?? 'useful',
        taskId: e.taskId ?? null,
        locationId: e.locationId ?? null,
        source: e.source ?? 'manual',
        start: e.start,
        end: e.end,
      });
  });
  return { changes, undo };
}

export async function recentActivities(limit = 8): Promise<{ activity: string; areaId: string | null; classification: Classification }[]> {
  const list = (await db.timeEntries.orderBy('start').reverse().toArray()).filter((e) => !e.deleted_at && (e.source === 'free' || e.source === 'manual'));
  const seen = new Set<string>();
  const out: { activity: string; areaId: string | null; classification: Classification }[] = [];
  for (const e of list) {
    const k = e.activity.trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ activity: e.activity, areaId: e.areaId, classification: e.classification });
    if (out.length >= limit) break;
  }
  return out;
}

export async function startSession(start: string, hours: number, reminderMinutes: number): Promise<LogSession> {
  const end = new Date(new Date(start).getTime() + hours * 3600000).toISOString();
  return create('sessions', { start, end, reminderMinutes, thieves: [] });
}

export async function activeSession(now = nowIso()): Promise<LogSession | undefined> {
  return (await db.sessions.toArray()).find((s) => !s.deleted_at && s.start <= now && s.end > now);
}
