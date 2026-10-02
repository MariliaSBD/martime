import { db } from '@/db/db';
import { create, get, remove, undoable, update, uuid, stamp } from '@/db/repo';
import { taskDefaults } from '@/db/defaults';
import type { EnergyLevel, EventStatus, Task, TimeEntry } from '@/db/types';
import { isVirtualId, materialise, parseVirtualId, planScope, type Scope } from '@/lib/domain/recurrence';
import { arrivalStatus } from '@/lib/domain/punctuality';
import { changeDeadline, postpone } from '@/lib/domain/deadlines';
import { resolveOverlaps } from '@/lib/domain/timeEntries';
import { dateKey, nowIso, toDate } from '@/lib/time';
import { saveSettings } from '../settings';
import i18n from '@/i18n';

export async function createTask(p: Partial<Task>): Promise<Task> {
  const t = await create('tasks', taskDefaults(p));
  if (p.areaId) await saveSettings({ lastAreaId: p.areaId });
  return t;
}

/** Returns the stored record for an item; a generated occurrence becomes its own record first. */
export async function ensureReal(id: string): Promise<Task | undefined> {
  if (!isVirtualId(id)) return get('tasks', id);
  const v = parseVirtualId(id)!;
  const existing = (await db.tasks.where('seriesId').equals(v.seriesId).toArray()).find((t) => t.occurrenceDate === v.date && !t.deleted_at);
  if (existing) return existing;
  const series = await get('tasks', v.seriesId);
  if (!series) return undefined;
  const rec = materialise(series, v.date, uuid());
  return create('tasks', rec);
}

export async function patchTask(id: string, patch: Partial<Task>): Promise<Task | undefined> {
  const t = await ensureReal(id);
  if (!t) return;
  return update('tasks', t.id, patch);
}

/** Edit or delete an occurrence of a repeating task: "Só esta", "Esta e as seguintes" or "Todas". */
export async function applyScope(occId: string, scope: Scope, action: { kind: 'edit'; patch: Partial<Task> } | { kind: 'delete' }): Promise<void> {
  let seriesId: string;
  let date: string;
  if (isVirtualId(occId)) ({ seriesId, date } = parseVirtualId(occId)!);
  else {
    const t = await get('tasks', occId);
    if (!t?.seriesId) return;
    seriesId = t.seriesId;
    date = t.occurrenceDate!;
  }
  const series = await get('tasks', seriesId);
  if (!series) return;
  const others = await db.tasks.where('seriesId').equals(seriesId).toArray();
  const plan = planScope(series, others, date, scope, action, uuid, stamp());
  for (const c of plan.create) {
    const { id, created_at: _c, updated_at: _u, user_id: _x, ...rest } = c;
    await create('tasks', { ...rest, id });
  }
  for (const u of plan.update) await update('tasks', u.id, u.patch);
  for (const r of plan.remove) await remove('tasks', r);
}

export async function deleteTask(id: string): Promise<() => Promise<void>> {
  const { undo } = await undoable(async () => {
    const t = await ensureReal(id);
    if (t) await remove('tasks', t.id);
  });
  return undo;
}

export async function duplicateTask(id: string): Promise<Task | undefined> {
  const t = await ensureReal(id);
  if (!t) return;
  const { id: _i, user_id: _u, created_at: _c, updated_at: _up, deleted_at: _d, ...rest } = t;
  return create('tasks', { ...rest, status: 'pending', completedAt: null, manualMinutes: null, energyAtDone: null, history: [], arrivedAt: null, eventStatus: null, seriesId: null, occurrenceDate: null, repeat: null });
}

// ---------- the single running activity (4.10) ----------
export async function runningEntries(): Promise<TimeEntry[]> {
  return (await db.timeEntries.toArray()).filter((e) => !e.deleted_at && !e.end);
}

/** Pauses the running task or ends the running free activity. Returns the name of what was stopped. */
async function stopRunning(at: string, exceptTaskId?: string): Promise<string | null> {
  let stopped: string | null = null;
  for (const e of await runningEntries()) {
    if (exceptTaskId && e.taskId === exceptTaskId) continue;
    await update('timeEntries', e.id, { end: at });
    stopped = e.activity;
  }
  return stopped;
}

async function addTravel(task: Task, arrival: string): Promise<void> {
  if (!task.travelMinutes) return;
  const exists = (await db.timeEntries.where('taskId').equals(task.id).toArray()).some((e) => e.source === 'travel' && !e.deleted_at);
  if (exists) return;
  const start = new Date(toDate(arrival).getTime() - task.travelMinutes * 60000).toISOString();
  const entry = { start, end: arrival, activity: i18n.t('today.travel'), areaId: task.areaId, classification: 'travel' as const, taskId: task.id, locationId: task.locationId, source: 'travel' as const };
  const others = (await db.timeEntries.toArray()).filter((e) => !e.deleted_at && e.end);
  for (const ch of resolveOverlaps({ id: '', start, end: arrival }, others, arrival)) await update('timeEntries', ch.id, ch.patch);
  await create('timeEntries', entry);
}

export interface ActionResult {
  undo: () => Promise<void>;
  paused: string | null;
}

export async function startTask(id: string, at = nowIso()): Promise<ActionResult> {
  let paused: string | null = null;
  const { undo } = await undoable(async () => {
    const t = await ensureReal(id);
    if (!t) return;
    paused = await stopRunning(at, t.id);
    const iv = (await db.timeEntries.where('taskId').equals(t.id).toArray()).filter((e) => e.source === 'timer' && !e.deleted_at);
    if (!iv.length) await addTravel(t, at);
    if (iv.some((e) => !e.end)) return;
    await create('timeEntries', { start: at, end: null, activity: t.title, areaId: t.areaId, classification: 'essential', taskId: t.id, locationId: t.locationId, source: 'timer' });
  });
  return { undo, paused };
}

export async function pauseTask(id: string, at = nowIso()): Promise<void> {
  const t = await get('tasks', id);
  if (!t) return;
  for (const e of await runningEntries()) if (e.taskId === t.id) await update('timeEntries', e.id, { end: at });
}

export const resumeTask = startTask;

export async function completeTask(id: string, opts: { manualMinutes?: number | null; at?: string } = {}): Promise<{ undo: () => Promise<void>; task?: Task }> {
  const at = opts.at ?? nowIso();
  let task: Task | undefined;
  const { undo } = await undoable(async () => {
    const t = await ensureReal(id);
    if (!t) return;
    for (const e of await runningEntries()) if (e.taskId === t.id) await update('timeEntries', e.id, { end: at });
    task = await update('tasks', t.id, { status: 'done', completedAt: at, manualMinutes: opts.manualMinutes ?? t.manualMinutes });
  });
  return { undo, task };
}

export async function setEnergy(id: string, level: EnergyLevel): Promise<void> {
  await update('tasks', id, { energyAtDone: level });
}

export async function hasTimer(id: string): Promise<boolean> {
  if (isVirtualId(id)) return false;
  return (await db.timeEntries.where('taskId').equals(id).toArray()).some((e) => e.source === 'timer' && !e.deleted_at);
}

export async function reopenTask(id: string): Promise<void> {
  await update('tasks', id, { status: 'pending', completedAt: null });
}

export async function postponeTask(id: string, to: string | null, via: 'manual' | 'reorganize' | 'review' = 'manual'): Promise<() => Promise<void>> {
  const { undo } = await undoable(async () => {
    const t = await ensureReal(id);
    if (t) await update('tasks', t.id, postpone(t, to, stamp(), via));
  });
  return undo;
}

export async function setDeadline(id: string, deadline: string | null): Promise<void> {
  const t = await ensureReal(id);
  if (t) await update('tasks', t.id, changeDeadline(t, deadline, stamp()));
}

// ---------- events ----------
export async function arrive(id: string, at = nowIso()): Promise<() => Promise<void>> {
  const { undo } = await undoable(async () => {
    const t = await ensureReal(id);
    if (!t || !t.date || !t.plannedStart) return;
    const s = arrivalStatus(t.date, t.plannedStart, at);
    await update('tasks', t.id, { arrivedAt: at, eventStatus: s.status });
    await addTravel(t, at);
  });
  return undo;
}

export async function setEventStatus(id: string, status: EventStatus | null): Promise<void> {
  const t = await ensureReal(id);
  if (t) await update('tasks', t.id, { eventStatus: status });
}

export function todayDate(): string {
  return dateKey(nowIso());
}
