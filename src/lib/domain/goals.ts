import type { Goal, Task, TimeEntry } from '@/db/types';
import { addDays, dateKey, diffDays, isoWeekday, type DateKey } from '../time';
import { occurrenceDates } from './recurrence';

export interface GoalContext {
  tasks: Task[];
  entries: TimeEntry[];
  goals: Goal[];
  now: string;
}

export interface Contribution {
  date: DateKey;
  label: string;
  amount: number;
  kind: 'task' | 'routine' | 'child' | 'manual' | 'hours';
  weekday: number;
}

/** Number of weeks or months in the goal's horizon (start → due). */
export function periods(goal: Pick<Goal, 'startDate' | 'dueDate' | 'freqPer'>): number {
  const days = diffDays(goal.startDate, goal.dueDate) + 1;
  if (goal.freqPer === 'week') return Math.max(1, Math.ceil(days / 7));
  const [y1, m1] = goal.startDate.split('-').map(Number);
  const [y2, m2] = goal.dueDate.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

/** Everything that contributed to the goal, with dates (10.2 "Caminho"). */
export function contributions(goal: Goal, ctx: GoalContext, until?: DateKey): Contribution[] {
  const end = until ?? dateKey(ctx.now);
  const out: Contribution[] = [];
  const push = (date: DateKey, label: string, amount: number, kind: Contribution['kind']) => date <= end && out.push({ date, label, amount, kind, weekday: isoWeekday(date) });
  const linked = ctx.tasks.filter((t) => t.goalId === goal.id && !t.deleted_at && !t.repeat);
  if (goal.type === 'number' && goal.source === 'tasks') {
    for (const t of linked) if (t.status === 'done' && t.completedAt) push(dateKey(t.completedAt), t.title, 1, 'task');
  } else if (goal.type === 'number' && goal.source === 'hours') {
    for (const t of linked) {
      const byDay = new Map<DateKey, number>();
      for (const e of ctx.entries) if (e.taskId === t.id && e.source === 'timer' && !e.deleted_at) byDay.set(dateKey(e.start), (byDay.get(dateKey(e.start)) ?? 0) + (new Date(e.end ?? ctx.now).getTime() - new Date(e.start).getTime()) / 3600000);
      if (!byDay.size && t.manualMinutes && t.completedAt) byDay.set(dateKey(t.completedAt), t.manualMinutes / 60);
      for (const [d, h] of byDay) push(d, t.title, Math.round(h * 100) / 100, 'hours');
    }
  } else if (goal.type === 'number') {
    let prev = 0;
    for (const m of [...goal.manualLog].sort((a, b) => (a.date < b.date ? -1 : 1))) {
      push(m.date, '', m.value - prev, 'manual');
      prev = m.value;
    }
  } else if (goal.type === 'complete') {
    const steps = linked;
    if (steps.length) for (const t of steps) t.status === 'done' && t.completedAt && push(dateKey(t.completedAt), t.title, 1, 'task');
    else for (const c of ctx.goals.filter((g) => g.parentId === goal.id && !g.deleted_at)) if (c.status === 'done' && c.completedAt) push(dateKey(c.completedAt), c.what, 1, 'child');
  } else if (goal.type === 'frequency' && goal.routineId) {
    for (const t of ctx.tasks) if (t.seriesId === goal.routineId && t.status === 'done' && !t.deleted_at && t.occurrenceDate && t.occurrenceDate >= goal.startDate && t.occurrenceDate <= goal.dueDate) push(t.occurrenceDate, t.title, 1, 'routine');
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

export interface GoalProgress {
  value: number;
  target: number;
  pct: number;
}

export function goalTarget(goal: Goal, ctx: GoalContext): number {
  if (goal.type === 'number') return goal.target;
  if (goal.type === 'frequency') return goal.freqN * periods(goal);
  const steps = ctx.tasks.filter((t) => t.goalId === goal.id && !t.deleted_at && !t.repeat).length;
  if (steps) return steps;
  const children = ctx.goals.filter((g) => g.parentId === goal.id && !g.deleted_at).length;
  return children || 1;
}

export function goalProgress(goal: Goal, ctx: GoalContext, until?: DateKey): GoalProgress {
  const target = goalTarget(goal, ctx);
  let value: number;
  const hasSteps = ctx.tasks.some((t) => t.goalId === goal.id && !t.deleted_at && !t.repeat) || ctx.goals.some((g) => g.parentId === goal.id && !g.deleted_at);
  if (goal.type === 'complete' && !hasSteps) value = goal.manualDone ? 1 : 0;
  else if (goal.type === 'number' && goal.source === 'manual') {
    const end = until ?? dateKey(ctx.now);
    const log = goal.manualLog.filter((m) => m.date <= end).sort((a, b) => (a.date < b.date ? -1 : 1));
    value = log.length ? log[log.length - 1].value : 0;
  } else value = contributions(goal, ctx, until).reduce((s, c) => s + c.amount, 0);
  value = Math.round(value * 100) / 100;
  return { value, target, pct: target ? Math.min(100, Math.round((value / target) * 100)) : 0 };
}

/** 10.2: straight line from 0 at the start date to the target at the due date. */
export function expectedAt(goal: Pick<Goal, 'startDate' | 'dueDate'>, target: number, date: DateKey): number {
  const total = diffDays(goal.startDate, goal.dueDate);
  if (total <= 0) return date >= goal.dueDate ? target : 0;
  const t = Math.max(0, Math.min(1, diffDays(goal.startDate, date) / total));
  return Math.round(target * t * 100) / 100;
}

export function pace(value: number, expected: number, target: number): { status: 'above' | 'below' | 'on'; n: number } {
  const diff = value - expected;
  const tolerance = Math.max(0.05 * target, 0.5);
  if (Math.abs(diff) < tolerance) return { status: 'on', n: 0 };
  const n = Math.round(Math.abs(diff) * 10) / 10;
  return { status: diff > 0 ? 'above' : 'below', n };
}

/** Points for the chart: actual value and expected pace per day. */
export function series(goal: Goal, ctx: GoalContext): { date: DateKey; value: number | null; expected: number }[] {
  const target = goalTarget(goal, ctx);
  const today = dateKey(ctx.now);
  const out: { date: DateKey; value: number | null; expected: number }[] = [];
  const total = diffDays(goal.startDate, goal.dueDate);
  const step = Math.max(1, Math.ceil(total / 60));
  for (let i = 0; i <= total; i += step) {
    const d = addDays(goal.startDate, i);
    out.push({ date: d, value: d <= today ? goalProgress(goal, ctx, d).value : null, expected: expectedAt(goal, target, d) });
  }
  if (out[out.length - 1]?.date !== goal.dueDate) out.push({ date: goal.dueDate, value: goal.dueDate <= today ? goalProgress(goal, ctx, goal.dueDate).value : null, expected: target });
  return out;
}

/** "70% do progresso veio de [atividade] às [dia da semana]". */
export function biggestSource(cs: Contribution[]): { label: string; weekday: number; pct: number } | null {
  const positive = cs.filter((c) => c.amount > 0 && c.label);
  const total = positive.reduce((s, c) => s + c.amount, 0);
  if (!total) return null;
  const by = new Map<string, { label: string; weekday: number; amount: number }>();
  for (const c of positive) {
    const k = `${c.label.toLocaleLowerCase('pt-PT')}|${c.weekday}`;
    const cur = by.get(k) ?? { label: c.label, weekday: c.weekday, amount: 0 };
    cur.amount += c.amount;
    by.set(k, cur);
  }
  const best = [...by.values()].sort((a, b) => b.amount - a.amount)[0];
  return { label: best.label, weekday: best.weekday, pct: Math.round((best.amount / total) * 100) };
}

/** Default review dates: half-way through the horizon and on the due date. */
export function defaultReviewDates(startDate: DateKey, dueDate: DateKey): DateKey[] {
  const mid = addDays(startDate, Math.floor(diffDays(startDate, dueDate) / 2));
  return mid === dueDate ? [dueDate] : [mid, dueDate];
}

/** Due date suggested by the horizon. */
export function horizonDue(start: DateKey, h: Goal['horizon']): DateKey {
  const d = { week: 6, month: 29, quarter: 90, year: 364 }[h];
  return addDays(start, d);
}

export function routineOccurrencesInRange(routine: Task, from: DateKey, to: DateKey): DateKey[] {
  return routine.repeat && routine.date ? occurrenceDates(routine.repeat, routine.date, from, to) : [];
}
