import type { HistoryEntry, Task } from '@/db/types';
import { dateKey, toDate } from '../time';

export type DeadlineOutcome = 'before' | 'on' | 'after';

/** 5.8: completed before the deadline day, on the deadline day (in time) or after the deadline. */
export function deadlineOutcome(deadline: string, completedAt: string): DeadlineOutcome {
  if (toDate(completedAt).getTime() > toDate(deadline).getTime()) return 'after';
  return dateKey(completedAt) === dateKey(deadline) ? 'on' : 'before';
}

export function deadlineChanges(history: HistoryEntry[]): number {
  return history.filter((h) => h.type === 'deadline').length;
}

export function postponements(history: HistoryEntry[]): number {
  return history.filter((h) => h.type === 'postpone').length;
}

/** Patch for changing the deadline: every change is kept in the history. */
export function changeDeadline(task: Pick<Task, 'deadline' | 'history'>, next: string | null, at: string): Partial<Task> {
  if (task.deadline === next) return {};
  const history = task.deadline ? [...task.history, { at, type: 'deadline' as const, from: task.deadline, to: next }] : task.history;
  return { deadline: next, history };
}

/** Patch for postponing (changing the planned date). */
export function postpone(task: Pick<Task, 'date' | 'history'>, to: string | null, at: string, via: HistoryEntry['via'] = 'manual'): Partial<Task> {
  return { date: to, history: [...task.history, { at, type: 'postpone', from: task.date, to, via }] };
}
