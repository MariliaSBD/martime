import type { RepeatRule, Task } from '@/db/types';
import { addDays, daysInMonth, isoWeekday, type DateKey } from '../time';

export type Scope = 'this' | 'following' | 'all';

export interface Occurrence extends Task {
  virtual?: boolean;
}

export function isSeries(t: Pick<Task, 'repeat' | 'seriesId'>): boolean {
  return !!t.repeat && !t.seriesId;
}

export function occursOn(rule: RepeatRule, start: DateKey, date: DateKey): boolean {
  if (date < start) return false;
  if (rule.until && date > rule.until) return false;
  switch (rule.freq) {
    case 'daily':
      return true;
    case 'weekdays':
      return (rule.days ?? []).includes(isoWeekday(date));
    case 'weekly':
      return isoWeekday(date) === isoWeekday(start);
    case 'monthly': {
      const want = Number(start.slice(8, 10));
      const [y, m, d] = date.split('-').map(Number);
      return d === Math.min(want, daysInMonth(y, m));
    }
  }
}

export function occurrenceDates(rule: RepeatRule, start: DateKey, from: DateKey, to: DateKey): DateKey[] {
  const out: DateKey[] = [];
  const s = from < start ? start : from;
  const e = rule.until && rule.until < to ? rule.until : to;
  for (let d = s; d <= e; d = addDays(d, 1)) if (occursOn(rule, start, d)) out.push(d);
  return out;
}

export const virtualId = (seriesId: string, date: DateKey) => `${seriesId}::${date}`;
export const isVirtualId = (id: string) => id.includes('::');
export function parseVirtualId(id: string): { seriesId: string; date: DateKey } | null {
  const [seriesId, date] = id.split('::');
  return date ? { seriesId, date } : null;
}

export function virtualOccurrence(series: Task, date: DateKey): Occurrence {
  return {
    ...series,
    id: virtualId(series.id, date),
    date,
    seriesId: series.id,
    occurrenceDate: date,
    status: 'pending',
    completedAt: null,
    manualMinutes: null,
    energyAtDone: null,
    history: [],
    arrivedAt: null,
    eventStatus: null,
    reorganizedOn: null,
    virtual: true,
  };
}

/**
 * All items (tasks and events) dated between from and to, including occurrences generated from repeating tasks.
 * An occurrence only becomes its own record once changed; records (even deleted) replace the generated one.
 */
export function expandItems(all: Task[], from: DateKey, to: DateKey): Occurrence[] {
  const out: Occurrence[] = [];
  const materialised = new Set<string>();
  for (const t of all) if (t.seriesId && t.occurrenceDate) materialised.add(virtualId(t.seriesId, t.occurrenceDate));
  for (const t of all) {
    if (t.deleted_at) continue;
    if (isSeries(t)) {
      if (!t.date) continue;
      for (const d of occurrenceDates(t.repeat!, t.date, from, to)) {
        if (!materialised.has(virtualId(t.id, d))) out.push(virtualOccurrence(t, d));
      }
    } else if (t.date && t.date >= from && t.date <= to && !t.skipped) {
      out.push(t);
    }
  }
  return out;
}

/** Fields that belong to one occurrence and are never copied across a series. */
const PER_OCCURRENCE: (keyof Task)[] = ['date', 'status', 'completedAt', 'manualMinutes', 'energyAtDone', 'history', 'arrivedAt', 'eventStatus', 'reorganizedOn', 'occurrenceDate', 'seriesId'];

function seriesPatch(patch: Partial<Task>): Partial<Task> {
  const p = { ...patch };
  for (const k of PER_OCCURRENCE) delete p[k];
  return p;
}

export interface ScopePlan {
  create: Task[];
  update: { id: string; patch: Partial<Task> }[];
  remove: string[];
}

/** Builds a record for an occurrence that is being changed for the first time. */
export function materialise(series: Task, date: DateKey, id: string): Task {
  const v = virtualOccurrence(series, date);
  delete v.virtual;
  return { ...v, id, repeat: null, exceptions: undefined };
}

/**
 * Editing or deleting an occurrence of a repeating task with "Só esta", "Esta e as seguintes" or "Todas".
 * `others` are the materialised occurrences of the series.
 */
export function planScope(
  series: Task,
  others: Task[],
  occDate: DateKey,
  scope: Scope,
  action: { kind: 'edit'; patch: Partial<Task> } | { kind: 'delete' },
  newId: () => string,
  now: string,
): ScopePlan {
  const plan: ScopePlan = { create: [], update: [], remove: [] };
  const existing = others.find((o) => o.occurrenceDate === occDate && !o.deleted_at);
  const live = others.filter((o) => !o.deleted_at);

  if (scope === 'this') {
    if (action.kind === 'edit') {
      if (existing) plan.update.push({ id: existing.id, patch: action.patch });
      else plan.create.push({ ...materialise(series, occDate, newId()), ...action.patch, created_at: now, updated_at: now });
    } else if (existing) plan.remove.push(existing.id);
    else plan.create.push({ ...materialise(series, occDate, newId()), skipped: true, deleted_at: now, created_at: now, updated_at: now });
    return plan;
  }

  if (scope === 'following' && occDate > series.date!) {
    const prevDay = addDays(occDate, -1);
    plan.update.push({ id: series.id, patch: { repeat: { ...series.repeat!, until: prevDay } } });
    const following = live.filter((o) => o.occurrenceDate! >= occDate);
    if (action.kind === 'edit') {
      const p = seriesPatch(action.patch);
      const nextSeries: Task = { ...series, ...p, id: newId(), date: occDate, repeat: { ...series.repeat!, ...(p.repeat ?? {}) }, created_at: now, updated_at: now };
      plan.create.push(nextSeries);
      for (const o of following) if (o.status !== 'done') plan.update.push({ id: o.id, patch: { ...p, seriesId: nextSeries.id } });
    } else {
      for (const o of following) if (o.status !== 'done') plan.remove.push(o.id);
    }
    return plan;
  }

  // 'all' (or 'following' from the first occurrence)
  if (action.kind === 'edit') {
    const p = seriesPatch(action.patch);
    plan.update.push({ id: series.id, patch: p });
    for (const o of live) if (o.status !== 'done') plan.update.push({ id: o.id, patch: p });
  } else {
    plan.remove.push(series.id);
    for (const o of live) if (o.status !== 'done') plan.remove.push(o.id);
  }
  return plan;
}
