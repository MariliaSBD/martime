import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import type { EnergyBlock, TimeEntry } from '@/db/types';
import { blockError, groupOf, outsideBlock, planGroups, suggestBlock, canShowEnergySuggestion, type EnergyRecord } from './energy';
import { decide, inSilence, next11, shouldRelease } from './silence';
import { routineStats, suggestRoutine } from './routines';
import { buildTip, type TipInput } from './tip';
import { addDays, atLocal } from '../time';

const block = (p: Partial<EnergyBlock>): EnergyBlock => ({ id: p.id ?? 'b', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, name: 'Manhã forte', start: '08:00', end: '12:00', level: 'high', ...p });
let n = 0;
const entry = (p: Partial<TimeEntry>): TimeEntry => ({ id: `e${++n}`, user_id: 'u', created_at: '', updated_at: '', deleted_at: null, start: '', end: null, activity: 'X', areaId: null, classification: 'essential', taskId: null, locationId: null, source: 'free', ...p });

describe('energy blocks (5.13)', () => {
  const blocks = [block({ id: 'hi', start: '08:00', end: '12:00', level: 'high' }), block({ id: 'lo', name: 'Tarde', start: '14:00', end: '17:00', level: 'low' })];
  it('rejects overlaps and end before start', () => {
    expect(blockError({ id: 'n', start: '11:00', end: '13:00' }, blocks)).toBe('overlap');
    expect(blockError({ id: 'n', start: '13:00', end: '12:00' }, blocks)).toBe('order');
    expect(blockError({ id: 'n', start: '12:00', end: '14:00' }, blocks)).toBeNull();
  });
  it('groups by chosen block, then by start time, else "Sem hora"', () => {
    expect(groupOf({ energyBlockId: 'lo', plannedStart: '09:00' }, blocks)).toBe('lo');
    expect(groupOf({ energyBlockId: null, plannedStart: '09:00' }, blocks)).toBe('hi');
    expect(groupOf({ energyBlockId: null, plannedStart: null }, blocks)).toBe('none');
    expect(groupOf({ energyBlockId: null, plannedStart: '20:00' }, blocks)).toBe('seg:evening');
  });
  it('without blocks uses Manhã / Tarde / Noite', () => {
    expect(groupOf({ energyBlockId: null, plannedStart: '11:59' }, [])).toBe('seg:morning');
    expect(groupOf({ energyBlockId: null, plannedStart: '12:00' }, [])).toBe('seg:afternoon');
    expect(groupOf({ energyBlockId: null, plannedStart: '19:00' }, [])).toBe('seg:evening');
    expect(planGroups([], new Set()).map((g) => g.id)).toEqual(['seg:morning', 'seg:afternoon', 'seg:evening', 'none']);
  });
  it('warns when the time is outside the chosen block', () => {
    expect(outsideBlock({ energyBlockId: 'hi', plannedStart: '15:00' }, blocks)).toBe(true);
    expect(outsideBlock({ energyBlockId: 'hi', plannedStart: '09:00' }, blocks)).toBe(false);
  });
  it('suggests the longest run of ≥ 2 hours with average ≥ 2.5', () => {
    const now = '2026-10-20T20:00:00Z';
    const recs: EnergyRecord[] = [];
    for (let d = 0; d < 15; d++) {
      const day = addDays('2026-10-05', d);
      recs.push({ at: atLocal(day, '09:10').toISOString(), level: 'high' });
      recs.push({ at: atLocal(day, '10:10').toISOString(), level: 'high' });
      recs.push({ at: atLocal(day, '11:10').toISOString(), level: d % 2 ? 'high' : 'medium' });
      recs.push({ at: atLocal(day, '16:10').toISOString(), level: 'low' });
    }
    expect(suggestBlock(recs, now)).toEqual({ start: '09:00', end: '12:00' });
    expect(suggestBlock(recs.slice(0, 20), now)).toBeNull(); // fewer than 30
    expect(canShowEnergySuggestion('2026-10-10T10:00:00Z', now)).toBe(false);
    expect(canShowEnergySuggestion('2026-10-06T10:00:00Z', now)).toBe(true);
  });
});

describe('silence (5.14, N2)', () => {
  const days = [{ startedAt: '2026-10-02T07:00:00Z', endedAt: '2026-10-02T22:30:00Z' }];
  it('between Terminar o dia and Começar o dia', () => {
    expect(inSilence('2026-10-02T22:00:00Z', { days, fixed: null })).toBe(false);
    expect(inSilence('2026-10-02T23:00:00Z', { days, fixed: null })).toBe(true);
    const next = [...days, { startedAt: '2026-10-03T07:30:00Z', endedAt: null }];
    expect(inSilence('2026-10-03T08:00:00Z', { days: next, fixed: null })).toBe(false);
  });
  it('deadlines, important dates and the weekly review are deferred; others are dropped', () => {
    const ctx = { days, fixed: null };
    expect(decide('deadline', '2026-10-02T23:00:00Z', ctx)).toBe('defer');
    expect(decide('importantDate', '2026-10-02T23:00:00Z', ctx)).toBe('defer');
    expect(decide('weeklyReview', '2026-10-02T23:00:00Z', ctx)).toBe('defer');
    expect(decide('planTomorrow', '2026-10-02T23:00:00Z', ctx)).toBe('drop');
    expect(decide('start', '2026-10-02T21:00:00Z', ctx)).toBe('send');
  });
  it('released when the day starts, or at 11:00', () => {
    const ctx = { days, fixed: null };
    expect(next11('2026-10-02T23:00:00Z')).toBe('2026-10-03T10:00:00.000Z'); // 11:00 Lisbon (UTC+1)
    expect(shouldRelease('2026-10-02T23:00:00Z', '2026-10-03T09:59:00Z', ctx)).toBe(false);
    expect(shouldRelease('2026-10-02T23:00:00Z', '2026-10-03T10:00:00Z', ctx)).toBe(true);
    const started = { days: [...days, { startedAt: '2026-10-03T08:00:00Z', endedAt: null }], fixed: null };
    expect(shouldRelease('2026-10-02T23:00:00Z', '2026-10-03T08:01:00Z', started)).toBe(true);
  });
  it('with Horário fixo, silence is between the sleep and wake targets', () => {
    const ctx = { days: [], fixed: { wake: '07:00', sleep: '23:00' } };
    expect(inSilence(atLocal('2026-10-02', '23:30').toISOString(), ctx)).toBe(true);
    expect(inSilence(atLocal('2026-10-03', '06:59').toISOString(), ctx)).toBe(true);
    expect(inSilence(atLocal('2026-10-03', '07:00').toISOString(), ctx)).toBe(false);
  });
});

describe('routines (5.9, 5.15)', () => {
  it('adherence and current streak', () => {
    const s = makeTask({ id: 's', title: 'Correr', date: '2026-10-01', repeat: { freq: 'daily' } });
    const occ = (d: string, status: 'done' | 'pending') => makeTask({ seriesId: 's', occurrenceDate: d, date: d, status });
    const all = [s, occ('2026-10-01', 'done'), occ('2026-10-02', 'pending'), occ('2026-10-03', 'done'), occ('2026-10-04', 'done')];
    expect(routineStats(s, all, '2026-10-05')).toEqual({ planned: 5, done: 3, pct: 60, streak: 2 });
  });
  it('suggests a routine after 3 times a week for 2 weeks in a row', () => {
    const days = ['2026-09-21', '2026-09-23', '2026-09-25', '2026-09-28', '2026-09-30', '2026-10-01'];
    const entries = days.map((d) => entry({ activity: 'Alongamentos', areaId: 'a', start: atLocal(d, '08:00').toISOString(), end: atLocal(d, '08:15').toISOString() }));
    const s = suggestRoutine([], entries, '2026-10-02T10:00:00Z', {});
    expect(s?.name).toBe('Alongamentos');
    expect(suggestRoutine([], entries.slice(1), '2026-10-02T10:00:00Z', {})).toBeNull();
    expect(suggestRoutine([], entries, '2026-10-02T10:00:00Z', { [s!.key]: '2026-09-20T00:00:00Z' })).toBeNull();
    const already = makeTask({ title: 'alongamentos', areaId: 'a', date: '2026-10-01', repeat: { freq: 'daily' } });
    expect(suggestRoutine([already], entries, '2026-10-02T10:00:00Z', {})).toBeNull();
  });
});

describe('end-of-day tip (15, R5)', () => {
  const date = '2026-10-02';
  const base = (p: Partial<TipInput>): TipInput => ({
    date,
    pct: 0,
    items: [],
    allTasks: [],
    entries: [],
    dayEntries: [],
    blocks: [],
    areas: [{ id: 'a', name: 'Profissional', color: 6, order: 0, user_id: 'u', created_at: '', updated_at: '', deleted_at: null }],
    activeFrom: atLocal(date, '08:00').toISOString(),
    activeTo: atLocal(date, '09:00').toISOString(),
    now: atLocal(date, '23:00').toISOString(),
    ...p,
  });
  const at = (h: string) => atLocal(date, h).toISOString();
  const timer = (taskId: string, s: string, e: string) => entry({ taskId, source: 'timer', start: at(s), end: at(e) });

  it('intro below 40%', () => {
    expect(buildTip(base({ pct: 39 })).intro).toBe(true);
    expect(buildTip(base({ pct: 40 })).intro).toBe(false);
  });
  it('B1 ≥ 80%', () => expect(buildTip(base({ pct: 80 })).good).toEqual({ rule: 'B1', values: { p: 80 } }));
  it('B2 ≥ 3 items started on time', () => {
    const items = ['09:00', '10:00', '11:00'].map((h, i) => makeTask({ id: `b2${i}`, date, plannedStart: h, plannedMinutes: 30 }));
    const es = items.map((t, i) => timer(t.id, ['09:02', '10:00', '11:05'][i], ['09:30', '10:30', '11:30'][i]));
    expect(buildTip(base({ pct: 0, items, entries: es })).good.rule).toBe('B2');
  });
  it('B3 estimates within 10%', () => {
    const items = [0, 1, 2].map((i) => makeTask({ id: `b3${i}`, date, plannedMinutes: 30 }));
    const es = [timer('b30', '08:00', '08:30'), timer('b31', '09:00', '09:33'), timer('b32', '10:00', '10:28')];
    expect(buildTip(base({ items, entries: es })).good).toEqual({ rule: 'B3', values: { d: 1 } });
  });
  it('B4 demanding tasks in high energy', () => {
    const blocks = [block({ id: 'hi' })];
    const items = [makeTask({ date, effort: 'demanding', status: 'done', energyBlockId: 'hi' })];
    expect(buildTip(base({ items, blocks })).good.rule).toBe('B4');
  });
  it('B5 ≥ 50% and B6 always', () => {
    expect(buildTip(base({ pct: 50 })).good.rule).toBe('B5');
    expect(buildTip(base({ pct: 10 })).good.rule).toBe('B6');
  });
  it('O1 event postponed / cancelled by me / missed', () => {
    const t = buildTip(base({ items: [makeTask({ kind: 'event', date, title: 'Dentista', eventStatus: 'missed' })] }));
    expect(t.watch).toEqual({ rule: 'O1', values: { event: 'Dentista', status: 'missed' } });
    expect(t.tomorrow.rule).toBe('T_O1');
  });
  it('O2 biggest overrun, area repeat and the suggestion for tomorrow', () => {
    const items = [makeTask({ id: 'o2a', date, title: 'Relatório', areaId: 'a', plannedMinutes: 30 }), makeTask({ id: 'o2b', date, title: 'Email', areaId: 'a', plannedMinutes: 30 })];
    const prev = [1, 2].map((d) => makeTask({ id: `p${d}`, date: addDays(date, -d), areaId: 'a', plannedMinutes: 60 }));
    const es = [timer('o2a', '08:00', '09:00'), timer('o2b', '10:00', '10:50'), entry({ taskId: 'p1', source: 'timer', start: atLocal(addDays(date, -1), '08:00').toISOString(), end: atLocal(addDays(date, -1), '09:30').toISOString() }), entry({ taskId: 'p2', source: 'timer', start: atLocal(addDays(date, -2), '08:00').toISOString(), end: atLocal(addDays(date, -2), '09:30').toISOString() })];
    const t = buildTip(base({ items, allTasks: [...items, ...prev], entries: es }));
    expect(t.watch).toEqual({ rule: 'O2', values: { task: 'Relatório', realMin: 60, plannedMin: 30, n: 4, area: 'Profissional' } });
    // ratios: 2, 1.67, 1.5, 1.5 → mean 1.667 × 30 = 50 → 45 (nearest 15)
    expect(t.tomorrow).toEqual({ rule: 'T_O2', values: { suggestionMin: 45, task: 'Relatório' } });
  });
  it('O3 average start delay ≥ 15 min', () => {
    const items = ['09:00', '10:00'].map((h, i) => makeTask({ id: `o3${i}`, date, plannedStart: h, plannedMinutes: 60 }));
    const es = [timer('o30', '09:20', '10:00'), timer('o31', '10:15', '11:00')];
    expect(buildTip(base({ items, entries: es })).watch).toEqual({ rule: 'O3', values: { min: 18 } });
  });
  it('O4 waste ≥ 60 min', () => {
    const dayEntries = [entry({ activity: 'Redes sociais', classification: 'waste', start: at('20:00'), end: at('21:10') })];
    const t = buildTip(base({ dayEntries, activeTo: at('21:10'), activeFrom: at('20:00') }));
    expect(t.watch).toEqual({ rule: 'O4', values: { timeMin: 70, activity: 'Redes sociais' } });
    expect(t.tomorrow).toEqual({ rule: 'T_O4', values: { activity: 'Redes sociais' } });
  });
  it('O5 demanding task in a low block; tomorrow names the high block', () => {
    const blocks = [block({ id: 'lo', name: 'Depois do almoço', start: '14:00', end: '16:00', level: 'low' }), block({ id: 'hi', name: 'Manhã forte' })];
    const t = buildTip(base({ items: [makeTask({ date, title: 'Tese', effort: 'demanding', plannedStart: '14:30' })], blocks }));
    expect(t.watch).toEqual({ rule: 'O5', values: { task: 'Tese' } });
    expect(t.tomorrow).toEqual({ rule: 'T_O5', values: { block: 'Manhã forte' } });
  });
  it('O6 ≥ 120 min without record', () => {
    const t = buildTip(base({ activeFrom: at('08:00'), activeTo: at('10:30') }));
    expect(t.watch).toEqual({ rule: 'O6', values: { timeMin: 150 } });
    expect(t.tomorrow.rule).toBe('T_O6');
  });
  it('no watch line → generic tomorrow line', () => {
    const t = buildTip(base({ pct: 90 }));
    expect(t.watch).toBeNull();
    expect(t.tomorrow.rule).toBe('T_none');
  });
});
