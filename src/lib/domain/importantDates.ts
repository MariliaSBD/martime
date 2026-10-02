import type { ImportantDate, Task } from '@/db/types';
import { addDays, daysInMonth, type DateKey } from '../time';

/** Date of an important date in a given year (29 February falls on the 28th in common years). */
export function inYear(date: DateKey, year: number): DateKey {
  const m = Number(date.slice(5, 7));
  const d = Math.min(Number(date.slice(8, 10)), daysInMonth(year, m));
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Occurrences between from and to (yearly ones repeat every year). */
export function occurrencesOf(d: Pick<ImportantDate, 'date' | 'yearly'>, from: DateKey, to: DateKey): DateKey[] {
  if (!d.yearly) return d.date >= from && d.date <= to ? [d.date] : [];
  const out: DateKey[] = [];
  for (let y = Math.max(Number(from.slice(0, 4)), Number(d.date.slice(0, 4))); y <= Number(to.slice(0, 4)); y++) {
    const k = inYear(d.date, y);
    if (k >= from && k <= to && k >= d.date) out.push(k);
  }
  return out;
}

/** The next occurrence on or after `today`. */
export function nextOccurrence(d: Pick<ImportantDate, 'date' | 'yearly'>, today: DateKey): DateKey | null {
  if (!d.yearly) return d.date >= today ? d.date : null;
  const y = Number(today.slice(0, 4));
  for (const yy of [y, y + 1]) {
    const k = inYear(d.date, yy);
    if (k >= today && k >= d.date) return k;
  }
  return null;
}

export interface PlannedTodo {
  todoId: string;
  title: string;
  date: DateKey;
  occurrence: DateKey;
}

/** Tasks the "O que fazer" list should have for the next occurrence. */
export function plannedTodos(d: ImportantDate, today: DateKey): PlannedTodo[] {
  const occ = nextOccurrence(d, today);
  if (!occ) return [];
  return d.todos.filter((t) => t.text.trim()).map((t) => ({ todoId: t.id, title: t.text.trim(), date: addDays(occ, -t.daysBefore), occurrence: occ }));
}

export interface TodoPlan {
  create: PlannedTodo[];
  update: { id: string; title: string; date: DateKey }[];
  remove: string[];
}

/** Only future tasks that are not done are changed when the important date is edited (9). */
export function planTodoTasks(d: ImportantDate, existing: Task[], today: DateKey): TodoPlan {
  const plan: TodoPlan = { create: [], update: [], remove: [] };
  const wanted = d.deleted_at ? [] : plannedTodos(d, today);
  const mine = existing.filter((t) => t.importantDateId === d.id && !t.deleted_at);
  const editable = (t: Task) => t.status !== 'done' && (t.date ?? '') >= today;
  for (const w of wanted) {
    const cur = mine.find((t) => t.todoId === w.todoId && t.importantOccurrence === w.occurrence);
    if (!cur) plan.create.push(w);
    else if (editable(cur) && (cur.title !== w.title || cur.date !== w.date)) plan.update.push({ id: cur.id, title: w.title, date: w.date });
  }
  for (const t of mine) {
    const keep = wanted.some((w) => w.todoId === t.todoId && w.occurrence === t.importantOccurrence);
    if (!keep && editable(t) && (!t.importantOccurrence || t.importantOccurrence >= today)) plan.remove.push(t.id);
  }
  return plan;
}
