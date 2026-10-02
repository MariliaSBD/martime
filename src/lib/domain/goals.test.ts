import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import type { Goal, TimeEntry } from '@/db/types';
import { biggestSource, contributions, defaultReviewDates, expectedAt, goalProgress, pace, periods } from './goals';
import { availableMinutes, canArrive, dayTooLong, needsOutcome, suggestApproach, suggestedEnd } from './misc';
import { atLocal } from '../time';

const goal = (p: Partial<Goal>): Goal => ({
  id: p.id ?? 'g',
  user_id: 'u',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  what: 'Ler 12 livros',
  measure: '',
  realistic: '',
  why: '',
  dueDate: '2026-10-31',
  areaId: 'a',
  horizon: 'month',
  startDate: '2026-10-01',
  parentId: null,
  type: 'number',
  target: 10,
  unit: 'livros',
  source: 'tasks',
  manualLog: [],
  manualDone: false,
  routineId: null,
  freqN: 3,
  freqPer: 'week',
  status: 'active',
  statusWhy: '',
  learned: '',
  order: 0,
  isMain: false,
  mainWhy: '',
  reviews: [],
  completedAt: null,
  ...p,
});
const now = '2026-10-16T12:00:00Z';

describe('goals (10, O1–O4)', () => {
  it('number from linked tasks done (1 each)', () => {
    const tasks = [makeTask({ goalId: 'g', status: 'done', completedAt: '2026-10-05T10:00:00Z' }), makeTask({ goalId: 'g', status: 'done', completedAt: '2026-10-07T10:00:00Z' }), makeTask({ goalId: 'g' })];
    expect(goalProgress(goal({}), { tasks, entries: [], goals: [], now })).toEqual({ value: 2, target: 10, pct: 20 });
  });
  it('number from timer hours on linked tasks', () => {
    const t = makeTask({ id: 'h1', goalId: 'g' });
    const e: TimeEntry = { id: 'e', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, start: '2026-10-05T10:00:00Z', end: '2026-10-05T11:30:00Z', activity: '', areaId: null, classification: 'essential', taskId: 'h1', locationId: null, source: 'timer' };
    expect(goalProgress(goal({ source: 'hours', unit: 'horas' }), { tasks: [t], entries: [e], goals: [], now }).value).toBe(1.5);
  });
  it('manual only when chosen', () => {
    const g = goal({ source: 'manual', manualLog: [{ date: '2026-10-03', value: 2 }, { date: '2026-10-10', value: 5 }] });
    const tasks = [makeTask({ goalId: 'g', status: 'done', completedAt: '2026-10-05T10:00:00Z' })];
    expect(goalProgress(g, { tasks, entries: [], goals: [], now }).value).toBe(5);
  });
  it('complete: steps done / total; without steps, by hand', () => {
    const tasks = [makeTask({ goalId: 'c', status: 'done', completedAt: '2026-10-05T10:00:00Z' }), makeTask({ goalId: 'c' }), makeTask({ goalId: 'c' }), makeTask({ goalId: 'c' })];
    expect(goalProgress(goal({ id: 'c', type: 'complete' }), { tasks, entries: [], goals: [], now }).pct).toBe(25);
    expect(goalProgress(goal({ id: 'c', type: 'complete', manualDone: true }), { tasks: [], entries: [], goals: [], now }).pct).toBe(100);
  });
  it('children act as steps of a "complete" parent without steps (O3)', () => {
    const p = goal({ id: 'p', type: 'complete' });
    const kids = [goal({ id: 'k1', parentId: 'p', status: 'done', completedAt: '2026-10-04T10:00:00Z' }), goal({ id: 'k2', parentId: 'p' })];
    expect(goalProgress(p, { tasks: [], entries: [], goals: kids, now })).toEqual({ value: 1, target: 2, pct: 50 });
  });
  it('frequency: routine completions / (N × periods)', () => {
    const g = goal({ type: 'frequency', routineId: 'r', freqN: 3, freqPer: 'week', startDate: '2026-10-05', dueDate: '2026-10-18' });
    expect(periods(g)).toBe(2);
    const tasks = ['2026-10-05', '2026-10-06', '2026-10-08'].map((d) => makeTask({ seriesId: 'r', occurrenceDate: d, date: d, status: 'done' }));
    expect(goalProgress(g, { tasks, entries: [], goals: [], now })).toEqual({ value: 3, target: 6, pct: 50 });
    expect(periods({ startDate: '2026-10-01', dueDate: '2026-12-31', freqPer: 'month' })).toBe(3);
  });
  it('expected pace line and above / below / on pace (O2)', () => {
    const g = goal({});
    expect(expectedAt(g, 10, '2026-10-01')).toBe(0);
    expect(expectedAt(g, 10, '2026-10-16')).toBe(5);
    expect(expectedAt(g, 10, '2026-10-31')).toBe(10);
    expect(pace(7, 5, 10)).toEqual({ status: 'above', n: 2 });
    expect(pace(3, 5, 10)).toEqual({ status: 'below', n: 2 });
    expect(pace(5.2, 5, 10)).toEqual({ status: 'on', n: 0 });
  });
  it('Caminho lists contributions with dates and the biggest source (O4)', () => {
    const tasks = [
      makeTask({ title: 'Ler', goalId: 'g', status: 'done', completedAt: '2026-10-03T10:00:00Z' }), // Saturday
      makeTask({ title: 'Ler', goalId: 'g', status: 'done', completedAt: '2026-10-10T10:00:00Z' }), // Saturday
      makeTask({ title: 'Ouvir audiolivro', goalId: 'g', status: 'done', completedAt: '2026-10-06T10:00:00Z' }),
    ];
    const cs = contributions(goal({}), { tasks, entries: [], goals: [], now });
    expect(cs.map((c) => c.date)).toEqual(['2026-10-03', '2026-10-06', '2026-10-10']);
    expect(biggestSource(cs)).toEqual({ label: 'Ler', weekday: 6, pct: 67 });
  });
  it('default reviews half-way and at the due date', () => {
    expect(defaultReviewDates('2026-10-01', '2026-10-31')).toEqual(['2026-10-16', '2026-10-31']);
  });
});

describe('small rules', () => {
  it('decision approach (11.2)', () => {
    expect(suggestApproach('low', 'easy')).toBe('fast');
    expect(suggestApproach('high', 'hard')).toBe('advice');
    expect(suggestApproach('high', 'easy')).toBe('data');
    expect(suggestApproach('low', 'hard')).toBe('data');
  });
  it('available time until the sleep target, else end of last block, else unknown', () => {
    const now = atLocal('2026-10-02', '20:00').toISOString();
    expect(availableMinutes(now, '2026-10-02', { sleepTarget: '23:30' }, [])).toBe(210);
    expect(availableMinutes(now, '2026-10-02', { sleepTarget: '00:30' }, [])).toBe(270);
    const b = { id: 'b', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, name: 'N', start: '19:00', end: '22:00', level: 'low' as const };
    expect(availableMinutes(now, '2026-10-02', { sleepTarget: null }, [b])).toBe(120);
    expect(availableMinutes(now, '2026-10-02', { sleepTarget: null }, [])).toBeNull();
  });
  it('20-hour warning and suggested end', () => {
    expect(dayTooLong('2026-10-02T06:00:00Z', '2026-10-03T02:01:00Z')).toBe(true);
    expect(dayTooLong('2026-10-02T06:00:00Z', '2026-10-03T02:00:00Z')).toBe(false);
    expect(suggestedEnd('2026-10-02T06:00:00Z', ['2026-10-02T21:00:00Z', null], ['2026-10-02T22:15:00Z'], '2026-10-03T03:00:00Z')).toBe('2026-10-02T22:15:00Z');
  });
  it('Cheguei window and "Como correu"', () => {
    const ev = makeTask({ kind: 'event', date: '2026-10-02', plannedStart: '15:00', plannedEnd: '16:00' });
    expect(canArrive(ev, atLocal('2026-10-02', '14:29').toISOString())).toBe(false);
    expect(canArrive(ev, atLocal('2026-10-02', '14:30').toISOString())).toBe(true);
    expect(canArrive(ev, atLocal('2026-10-02', '16:01').toISOString())).toBe(false);
    expect(needsOutcome(ev, atLocal('2026-10-02', '16:00').toISOString())).toBe(true);
    expect(needsOutcome({ ...ev, arrivedAt: 'x' }, atLocal('2026-10-02', '16:00').toISOString())).toBe(false);
  });
});
