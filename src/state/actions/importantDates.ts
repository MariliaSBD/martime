import { db } from '@/db/db';
import { remove, update } from '@/db/repo';
import { planTodoTasks } from '@/lib/domain/importantDates';
import { dateKey, nowIso } from '@/lib/time';
import { createTask } from './tasks';
import { liveAreas } from './areas';

/** Keeps the tasks of an important date's "O que fazer" list in line with it. */
export async function syncTodoTasks(id: string): Promise<void> {
  const d = await db.importantDates.get(id);
  if (!d) return;
  const tasks = await db.tasks.where('importantDateId').equals(id).toArray();
  const plan = planTodoTasks(d, tasks, dateKey(nowIso()));
  const areaId = d.areaId ?? (await liveAreas())[0]?.id ?? '';
  for (const c of plan.create) await createTask({ title: c.title, date: c.date, areaId, importantDateId: d.id, todoId: c.todoId, importantOccurrence: c.occurrence });
  for (const u of plan.update) await update('tasks', u.id, { title: u.title, date: u.date });
  for (const r of plan.remove) await remove('tasks', r);
}

/** Yearly dates roll over to the next year: run when the calendar opens. */
export async function syncAllTodoTasks(): Promise<void> {
  for (const d of await db.importantDates.toArray()) if (!d.deleted_at && d.todos.length) await syncTodoTasks(d.id);
}
