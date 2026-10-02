import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import type { TimeEntry } from '@/db/types';
import { combine, progressOf } from './progress';
import { arrivalStatus, punctualityItems, punctualityStats, reliability } from './punctuality';
import { changeDeadline, deadlineChanges, deadlineOutcome, postpone } from './deadlines';
import { gaps, resolveOverlaps, taskTimer, thirtyMinuteTable, timeThieves } from './timeEntries';

let n = 0;
const entry = (p: Partial<TimeEntry>): TimeEntry => ({
  id: p.id ?? `e${++n}`,
  user_id: 'u',
  created_at: '',
  updated_at: '',
  deleted_at: null,
  start: '2026-10-02T08:00:00.000Z',
  end: null,
  activity: 'X',
  areaId: null,
  classification: 'essential',
  taskId: null,
  locationId: null,
  source: 'free',
  ...p,
});

describe('progress (5.6, H9)', () => {
  it('weights tasks by planned duration and events by 30', () => {
    const items = [
      makeTask({ date: '2026-10-02', plannedMinutes: 90, status: 'done' }),
      makeTask({ date: '2026-10-02', plannedMinutes: 30 }),
      makeTask({ date: '2026-10-02', kind: 'event', plannedMinutes: 240, eventStatus: 'late' }),
    ];
    // (90 + 30) / (90 + 30 + 30) = 80%
    expect(progressOf(items).pct).toBe(80);
  });
  it('a task without duration weighs 30', () => {
    expect(progressOf([makeTask({ plannedMinutes: 0, status: 'done' }), makeTask({ plannedMinutes: 90 })]).pct).toBe(25);
  });
  it('event credits and cancelled by the other person leaves the calculation', () => {
    const ev = (s: string | null) => makeTask({ kind: 'event', eventStatus: s as never });
    expect(progressOf([ev('ontime'), ev('cancelled_other')]).pct).toBe(100);
    expect(progressOf([ev('ontime'), ev('postponed')]).pct).toBe(50);
    expect(progressOf([ev('ontime'), ev('cancelled_me'), ev('missed'), ev(null)]).pct).toBe(25);
  });
  it('tasks delegated or refused in Reorganizar leave that day', () => {
    expect(progressOf([makeTask({ status: 'done', date: 'd' }), makeTask({ status: 'delegated', date: 'd', reorganizedOn: 'd' }), makeTask({ status: 'refused', date: 'd', reorganizedOn: 'd' })]).pct).toBe(100);
  });
  it('no items means no data', () => {
    expect(progressOf([]).pct).toBeNull();
  });
  it('periods sum weights instead of averaging percentages', () => {
    // day 1: 30/30 = 100%; day 2: 0/90 = 0%. Average would be 50%, correct is 25%.
    expect(combine([{ done: 30, total: 30 }, { done: 0, total: 90 }]).pct).toBe(25);
  });
});

describe('timer (5.5, H4, H5)', () => {
  it('real time is the sum of intervals, excluding pauses, from stored instants', () => {
    const t = makeTask({ id: 'a' });
    const es = [entry({ taskId: 'a', source: 'timer', start: '2026-10-02T08:00:00Z', end: '2026-10-02T08:20:00Z' }), entry({ taskId: 'a', source: 'timer', start: '2026-10-02T09:00:00Z', end: null })];
    const r = taskTimer(t, es, '2026-10-02T09:15:00Z');
    expect(r.state).toBe('running');
    expect(r.realMinutes).toBe(35);
    // reopening the app hours later still gives the right value
    expect(taskTimer(t, es, '2026-10-02T11:00:00Z').realMinutes).toBe(140);
  });
  it('paused and idle', () => {
    const t = makeTask({ id: 'b' });
    expect(taskTimer(t, [], 'x').state).toBe('idle');
    expect(taskTimer(t, [entry({ taskId: 'b', source: 'timer', end: '2026-10-02T08:10:00Z' })], '2026-10-02T09:00:00Z').state).toBe('paused');
  });
});

describe('time entries (5.10, H12)', () => {
  it('finds gaps ("Sem registo")', () => {
    const es = [entry({ start: '2026-10-02T08:00:00Z', end: '2026-10-02T09:00:00Z' }), entry({ start: '2026-10-02T10:00:00Z', end: '2026-10-02T10:30:00Z' })];
    expect(gaps(es, '2026-10-02T07:30:00Z', '2026-10-02T11:00:00Z', '2026-10-02T11:00:00Z')).toEqual([
      { start: '2026-10-02T07:30:00.000Z', end: '2026-10-02T08:00:00.000Z' },
      { start: '2026-10-02T09:00:00.000Z', end: '2026-10-02T10:00:00.000Z' },
      { start: '2026-10-02T10:30:00.000Z', end: '2026-10-02T11:00:00.000Z' },
    ]);
  });
  it('editing an entry shortens or removes the overlapped ones', () => {
    const a = entry({ id: 'a', activity: 'Email', start: '2026-10-02T08:00:00Z', end: '2026-10-02T09:00:00Z' });
    const b = entry({ id: 'b', activity: 'Café', start: '2026-10-02T09:10:00Z', end: '2026-10-02T09:20:00Z' });
    const c = entry({ id: 'c', activity: 'Ler', start: '2026-10-02T09:30:00Z', end: '2026-10-02T10:30:00Z' });
    const ch = resolveOverlaps({ id: 'x', start: '2026-10-02T08:30:00Z', end: '2026-10-02T10:00:00Z' }, [a, b, c], '2026-10-02T12:00:00Z');
    expect(ch).toEqual([
      { id: 'a', activity: 'Email', kind: 'shortened', patch: { end: '2026-10-02T08:30:00.000Z' } },
      { id: 'b', activity: 'Café', kind: 'removed', patch: { deleted_at: '2026-10-02T12:00:00.000Z' } },
      { id: 'c', activity: 'Ler', kind: 'shortened', patch: { start: '2026-10-02T10:00:00.000Z' } },
    ]);
  });
});

describe('30-minute table and time thieves (5.11, H13)', () => {
  it('48 h session gives 96 slots with the dominant activity, tie to the first, mostly empty = Sem registo', () => {
    const es = [
      entry({ activity: 'Email', start: '2026-10-02T08:00:00Z', end: '2026-10-02T08:15:00Z' }),
      entry({ activity: 'Ler', start: '2026-10-02T08:15:00Z', end: '2026-10-02T08:30:00Z' }),
      entry({ activity: 'Redes sociais', classification: 'waste', start: '2026-10-02T08:30:00Z', end: '2026-10-02T08:50:00Z' }),
      entry({ activity: 'redes  Sociais ', classification: 'waste', start: '2026-10-02T09:00:00Z', end: '2026-10-02T09:10:00Z' }),
      entry({ activity: 'TV', classification: 'waste', start: '2026-10-02T10:00:00Z', end: '2026-10-02T10:05:00Z' }),
    ];
    const table = thirtyMinuteTable(es, '2026-10-02T08:00:00Z', '2026-10-04T08:00:00Z', '2026-10-05T00:00:00Z');
    expect(table).toHaveLength(96);
    expect(table[0].activity).toBe('Email'); // 15/15 tie → first started
    expect(table[1].activity).toBe('Redes sociais');
    expect(table[2].activity).toBeNull(); // 10 of 30 min
    const thieves = timeThieves(es, '2026-10-05T00:00:00Z');
    expect(thieves[0]).toEqual({ name: 'Redes sociais', minutes: 30 });
    expect(thieves[1]).toEqual({ name: 'TV', minutes: 5 });
  });
});

describe('punctuality and reliability (5.7)', () => {
  it('tasks started up to 5 min late are on time', () => {
    const a = makeTask({ id: 'p1', date: '2026-10-02', plannedStart: '09:00' });
    const b = makeTask({ id: 'p2', date: '2026-10-02', plannedStart: '10:00' });
    const es = [entry({ taskId: 'p1', source: 'timer', start: '2026-10-02T08:05:00Z' }), entry({ taskId: 'p2', source: 'timer', start: '2026-10-02T09:20:00Z' })];
    const items = punctualityItems([a, b], es);
    expect(items.map((i) => [i.late, i.onTime])).toEqual([
      [5, true],
      [20, false],
    ]);
    expect(punctualityStats(items)).toEqual({ count: 2, onTimePct: 50, avgLate: 20 });
  });
  it('Cheguei sets on time or late', () => {
    expect(arrivalStatus('2026-10-02', '15:00', '2026-10-02T14:05:00Z')).toEqual({ status: 'ontime', late: 5 });
    expect(arrivalStatus('2026-10-02', '15:00', '2026-10-02T14:12:00Z')).toEqual({ status: 'late', late: 12 });
  });
  it('reliability excludes cancelled by the other person', () => {
    const ev = (s: string) => makeTask({ kind: 'event', eventStatus: s as never });
    expect(reliability([ev('ontime'), ev('late'), ev('missed'), ev('cancelled_me'), ev('cancelled_other')])).toEqual({ pct: 50, count: 4 });
  });
});

describe('deadlines (5.8, T6)', () => {
  const dl = '2026-10-10T17:00:00.000Z';
  it('before / on the day / after', () => {
    expect(deadlineOutcome(dl, '2026-10-09T10:00:00Z')).toBe('before');
    expect(deadlineOutcome(dl, '2026-10-10T08:00:00Z')).toBe('on');
    expect(deadlineOutcome(dl, '2026-10-10T18:00:00Z')).toBe('after');
  });
  it('every deadline change is kept as a postponement', () => {
    const t = makeTask({ deadline: dl });
    const p1 = changeDeadline(t, '2026-10-12T17:00:00.000Z', 'a');
    const p2 = changeDeadline({ ...t, ...p1 }, '2026-10-15T17:00:00.000Z', 'b');
    expect(deadlineChanges(p2.history!)).toBe(2);
    expect(postpone(t, '2026-10-03', 'c').history![0]).toMatchObject({ type: 'postpone', to: '2026-10-03' });
  });
});
