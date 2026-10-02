import type { Task } from './types';

export type TaskData = Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

export function taskDefaults(p: Partial<Task> = {}): TaskData {
  return {
    kind: 'task',
    title: '',
    areaId: '',
    date: null,
    plannedStart: null,
    plannedEnd: null,
    plannedMinutes: 30,
    urgent: 'unset',
    important: 'unset',
    hard: false,
    hardReason: '',
    effort: 'unset',
    energyBlockId: null,
    projectId: null,
    critical: false,
    goalId: null,
    deadline: null,
    repeat: null,
    locationId: null,
    travelMinutes: 0,
    reminder: true,
    notes: '',
    status: 'pending',
    delegatedTo: '',
    followUp: null,
    completedAt: null,
    manualMinutes: null,
    energyAtDone: null,
    history: [],
    order: 0,
    seriesId: null,
    occurrenceDate: null,
    arrivedAt: null,
    eventStatus: null,
    importantDateId: null,
    todoId: null,
    reorganizedOn: null,
    ...p,
  };
}

let n = 0;
/** Full task record for tests. */
export function makeTask(p: Partial<Task> = {}): Task {
  n++;
  return {
    ...taskDefaults(p),
    id: p.id ?? `t${n}`,
    user_id: 'u',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    deleted_at: p.deleted_at ?? null,
  };
}
