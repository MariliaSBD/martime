import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import type { ImportantDate } from '@/db/types';
import { nextOccurrence, occurrencesOf, planTodoTasks, plannedTodos } from './importantDates';

const idate = (p: Partial<ImportantDate> = {}): ImportantDate => ({
  id: 'd',
  user_id: 'u',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  name: 'Aniversário da mãe',
  date: '2026-11-20',
  yearly: true,
  areaId: 'a',
  reminders: [7, 1],
  todos: [
    { id: 'x', text: 'Comprar presente', daysBefore: 3 },
    { id: 'y', text: 'Ligar', daysBefore: 0 },
  ],
  ...p,
});

describe('important dates (9, C6)', () => {
  it('repeat every year', () => {
    expect(occurrencesOf(idate(), '2026-01-01', '2028-12-31')).toEqual(['2026-11-20', '2027-11-20', '2028-11-20']);
    expect(occurrencesOf(idate({ yearly: false }), '2026-01-01', '2028-12-31')).toEqual(['2026-11-20']);
    expect(nextOccurrence(idate(), '2026-11-21')).toBe('2027-11-20');
    expect(nextOccurrence(idate({ date: '2028-02-29' }), '2029-01-01')).toBe('2029-02-28');
  });
  it('to-do items become tasks on the right relative days', () => {
    expect(plannedTodos(idate(), '2026-10-02')).toEqual([
      { todoId: 'x', title: 'Comprar presente', date: '2026-11-17', occurrence: '2026-11-20' },
      { todoId: 'y', title: 'Ligar', date: '2026-11-20', occurrence: '2026-11-20' },
    ]);
  });
  it('editing changes only future tasks not yet done', () => {
    const done = makeTask({ id: 't1', importantDateId: 'd', todoId: 'x', importantOccurrence: '2026-11-20', date: '2026-11-17', status: 'done', title: 'Comprar presente' });
    const open = makeTask({ id: 't2', importantDateId: 'd', todoId: 'y', importantOccurrence: '2026-11-20', date: '2026-11-20', title: 'Ligar' });
    const moved = idate({ date: '2026-11-22' });
    const plan = planTodoTasks(moved, [done, open], '2026-11-18');
    expect(plan.remove).toEqual(['t2']);
    expect(plan.create.map((c) => [c.todoId, c.date])).toEqual([
      ['x', '2026-11-19'],
      ['y', '2026-11-22'],
    ]);
    expect(plan.update).toEqual([]);
  });
});
