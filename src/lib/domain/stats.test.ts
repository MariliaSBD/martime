import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import type { Area, Day, TimeEntry } from '@/db/types';
import { computeStats, type StatsInput } from './stats';
import { addDays, atLocal } from '../time';

let n = 0;
const entry = (p: Partial<TimeEntry>): TimeEntry => ({ id: `e${++n}`, user_id: 'u', created_at: '', updated_at: '', deleted_at: null, start: '', end: null, activity: 'X', areaId: 'a', classification: 'essential', taskId: null, locationId: null, source: 'free', ...p });
const day = (p: Partial<Day>): Day => ({ id: `d${++n}`, user_id: 'u', created_at: '', updated_at: '', deleted_at: null, date: '', startedAt: '', endedAt: null, frozen: null, feeling: null, tip: null, ...p });
const area: Area = { id: 'a', name: 'Profissional', color: 6, order: 0, user_id: 'u', created_at: '', updated_at: '', deleted_at: null };
const at = (d: string, h: string) => atLocal(d, h).toISOString();

function base(): StatsInput {
  const raw = [];
  const entries: TimeEntry[] = [];
  // week 5–11 Oct 2026: 5 tasks with 60 planned / 84 real → underestimate 40%
  for (let i = 0; i < 5; i++) {
    const d = addDays('2026-10-05', i);
    const t = makeTask({ id: `w${i}`, date: d, areaId: 'a', plannedMinutes: 60, plannedStart: '09:00', status: 'done', completedAt: at(d, '10:30'), energyAtDone: i % 2 ? 'high' : 'medium' });
    raw.push(t);
    entries.push(entry({ taskId: t.id, source: 'timer', start: at(d, i < 2 ? '09:00' : '09:30'), end: at(d, i < 2 ? '10:24' : '10:54') }));
  }
  // previous week: 1 of 2 tasks done
  raw.push(makeTask({ date: '2026-09-30', plannedMinutes: 30, status: 'done', completedAt: at('2026-09-30', '10:00') }), makeTask({ date: '2026-09-30', plannedMinutes: 30 }));
  // deadlines
  raw.push(makeTask({ date: '2026-10-06', deadline: at('2026-10-06', '18:00'), status: 'done', completedAt: at('2026-10-06', '19:00'), plannedMinutes: 0, history: [{ at: at('2026-10-05', '08:00'), type: 'deadline', from: 'x', to: 'y' }] }));
  raw.push(makeTask({ date: '2026-10-07', kind: 'event', plannedStart: '15:00', plannedEnd: '16:00', eventStatus: 'ontime' }), makeTask({ date: '2026-10-08', kind: 'event', plannedStart: '15:00', plannedEnd: '16:00', eventStatus: 'missed' }));
  entries.push(entry({ activity: 'Redes sociais', classification: 'waste', start: at('2026-10-06', '21:00'), end: at('2026-10-06', '22:00') }));
  entries.push(entry({ activity: 'Sono', source: 'sleep', start: at('2026-10-05', '23:00'), end: at('2026-10-06', '07:00') }));
  const days = [day({ date: '2026-10-06', startedAt: at('2026-10-06', '07:00'), endedAt: at('2026-10-06', '23:00'), feeling: 4 })];
  return { raw, entries, days, areas: [area], now: at('2026-10-11', '20:00') };
}

describe('statistics (11.1, R1)', () => {
  const s = computeStats(base(), '2026-10-05', '2026-10-11');
  it('1 progress with variation against the previous period', () => {
    // this week: 5 tasks done (5×60) + deadline task done (30) + event ontime (30) + event missed (0) = 360/390
    expect(s.progress.pct).toBe(92);
    expect(s.progress.prevPct).toBe(50);
    expect(s.progress.delta).toBe(42);
  });
  it('2 planned and real by day and total', () => {
    expect(s.plannedReal.days).toHaveLength(7);
    expect(s.plannedReal.days[0]).toEqual({ date: '2026-10-05', planned: 60, real: 84 });
    expect(s.plannedReal.real).toBe(84 * 5 + 30); // the on-time event counts its 30 planned minutes
  });
  it('3 accuracy by area needs 5 tasks; underestimated by 40%', () => {
    expect(s.accuracy).toEqual([{ areaId: 'a', name: 'Profissional', n: 5, pct: 40, kind: 'under' }]);
  });
  it('4 punctuality and 5 reliability', () => {
    // 5 started tasks (2 on time) + 1 event marked on time = 3 of 6
    expect(s.punctuality).toEqual({ count: 6, onTimePct: 50, avgLate: 30 });
    expect(s.reliability).toEqual({ pct: 50, count: 2 });
  });
  it('6 deadlines', () => expect(s.deadlines).toEqual({ onTime: 0, after: 1, postponements: 1 }));
  it('7 time by area and 8 classification exclude sleep', () => {
    expect(s.byArea[0]).toMatchObject({ areaId: 'a', minutes: 84 * 5 + 60, pct: 100 });
    expect(s.classes).toEqual({ essential: 420, useful: 0, waste: 60, travel: 0 });
  });
  it('9 time thieves', () => expect(s.thieves).toEqual([{ name: 'Redes sociais', minutes: 60 }]));
  it('10 energy by weekday and hour', () => {
    expect(s.energy).toContainEqual({ weekday: 1, hour: 10, avg: 2, n: 1 });
    expect(s.energy).toContainEqual({ weekday: 2, hour: 10, avg: 3, n: 1 });
  });
  it('11 sleep and 12 feelings', () => {
    expect(s.sleep.avgMinutes).toBe(480);
    expect(s.sleep.days.find((d) => d.date === '2026-10-06')!.minutes).toBe(480);
    expect(s.feelings.days).toEqual([{ date: '2026-10-06', feeling: 4 }]);
    expect(s.feelings.goodSleepAvg).toBeNull(); // fewer than 10 days
  });
  it('13 routines', () => {
    const i = base();
    i.raw.push(makeTask({ id: 'r', title: 'Correr', date: '2026-10-05', repeat: { freq: 'daily' } }), makeTask({ seriesId: 'r', occurrenceDate: '2026-10-05', date: '2026-10-05', status: 'done' }));
    expect(computeStats(i, '2026-10-05', '2026-10-11').routines[0]).toMatchObject({ title: 'Correr', stats: { planned: 7, done: 1 } });
  });
  it('works for day, month, year and custom periods', () => {
    expect(computeStats(base(), '2026-10-05', '2026-10-05').progress.pct).toBe(100);
    expect(computeStats(base(), '2026-10-01', '2026-10-31').plannedReal.days).toHaveLength(31);
    expect(computeStats(base(), '2026-01-01', '2026-12-31').progress.pct).toBe(Math.round((360 + 30) / (390 + 60) * 100));
    // 6–8 Oct: three 60-min tasks done, deadline task (weight 30) done, event on time (30), event missed (30, 0) → 240/270
    expect(computeStats(base(), '2026-10-06', '2026-10-08').progress.pct).toBe(89);
  });
});
