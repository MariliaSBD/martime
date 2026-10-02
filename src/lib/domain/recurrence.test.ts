import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import { expandItems, occurrenceDates, planScope } from './recurrence';
import type { Task } from '@/db/types';

describe('repetition (5.9, T5)', () => {
  it('daily', () => {
    expect(occurrenceDates({ freq: 'daily' }, '2026-10-01', '2026-09-28', '2026-10-03')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
  });
  it('chosen weekdays', () => {
    // Mon 5, Wed 7, Fri 9 October 2026
    expect(occurrenceDates({ freq: 'weekdays', days: [1, 3, 5] }, '2026-10-01', '2026-10-05', '2026-10-11')).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
  });
  it('weekly on the start weekday', () => {
    expect(occurrenceDates({ freq: 'weekly' }, '2026-10-02', '2026-10-01', '2026-10-31')).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
  });
  it('monthly on 31 uses the last day of shorter months', () => {
    expect(occurrenceDates({ freq: 'monthly' }, '2027-01-31', '2027-01-01', '2027-06-30')).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31', '2027-06-30']);
  });
  it('monthly on 29 and 30 in February (leap and common years)', () => {
    expect(occurrenceDates({ freq: 'monthly' }, '2027-01-29', '2027-02-01', '2027-02-28')).toEqual(['2027-02-28']);
    expect(occurrenceDates({ freq: 'monthly' }, '2028-01-30', '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
    expect(occurrenceDates({ freq: 'monthly' }, '2028-01-29', '2028-02-01', '2028-02-29')).toEqual(['2028-02-29']);
  });
  it('respects the end date', () => {
    expect(occurrenceDates({ freq: 'daily', until: '2026-10-03' }, '2026-10-01', '2026-10-01', '2026-10-10')).toHaveLength(3);
  });

  it('generates occurrences without duplicates; a changed occurrence replaces the generated one', () => {
    const s = makeTask({ id: 's', title: 'Correr', date: '2026-10-01', repeat: { freq: 'daily' } });
    const changed = makeTask({ id: 'm', title: 'Correr', date: '2026-10-02', seriesId: 's', occurrenceDate: '2026-10-02', status: 'done' });
    const items = expandItems([s, changed], '2026-10-01', '2026-10-03');
    expect(items.map((i) => `${i.id}:${i.date}`)).toEqual(['s::2026-10-01:2026-10-01', 's::2026-10-03:2026-10-03', 'm:2026-10-02']);
  });

  const series = () => makeTask({ id: 's', title: 'Ler', date: '2026-10-01', plannedStart: '08:00', repeat: { freq: 'daily' } });
  let k = 0;
  const id = () => `new${++k}`;
  const apply = (all: Task[], plan: ReturnType<typeof planScope>) => {
    let out = all.map((t) => {
      const u = plan.update.filter((x) => x.id === t.id).reduce((acc, x) => ({ ...acc, ...x.patch }), t);
      return plan.remove.includes(t.id) ? { ...u, deleted_at: 'now' } : u;
    });
    out = [...out, ...plan.create];
    return out;
  };

  it('edit "Só esta" changes one occurrence', () => {
    const s = series();
    const plan = planScope(s, [], '2026-10-03', 'this', { kind: 'edit', patch: { title: 'Ler 1 capítulo' } }, id, 'now');
    const items = expandItems(apply([s], plan), '2026-10-01', '2026-10-05');
    expect(items.filter((i) => i.title === 'Ler 1 capítulo').map((i) => i.date)).toEqual(['2026-10-03']);
    expect(items).toHaveLength(5);
  });

  it('edit "Esta e as seguintes" splits the series', () => {
    const s = series();
    const plan = planScope(s, [], '2026-10-03', 'following', { kind: 'edit', patch: { plannedStart: '09:00' } }, id, 'now');
    const items = expandItems(apply([s], plan), '2026-10-01', '2026-10-05');
    expect(items.map((i) => `${i.date} ${i.plannedStart}`).sort()).toEqual(['2026-10-01 08:00', '2026-10-02 08:00', '2026-10-03 09:00', '2026-10-04 09:00', '2026-10-05 09:00']);
  });

  it('edit "Todas" changes every occurrence but keeps completed ones', () => {
    const s = series();
    const done = makeTask({ id: 'd', title: 'Ler', date: '2026-10-02', seriesId: 's', occurrenceDate: '2026-10-02', status: 'done' });
    const plan = planScope(s, [done], '2026-10-04', 'all', { kind: 'edit', patch: { title: 'Ler 20 min' } }, id, 'now');
    const items = expandItems(apply([s, done], plan), '2026-10-01', '2026-10-05');
    expect(items.filter((i) => i.title === 'Ler 20 min')).toHaveLength(4);
    expect(items.find((i) => i.date === '2026-10-02')!.title).toBe('Ler');
  });

  it('delete "Só esta", "Esta e as seguintes" and "Todas"', () => {
    const s = series();
    const one = expandItems(apply([s], planScope(s, [], '2026-10-02', 'this', { kind: 'delete' }, id, 'now')), '2026-10-01', '2026-10-04');
    expect(one.map((i) => i.date)).toEqual(['2026-10-01', '2026-10-03', '2026-10-04']);
    const next = expandItems(apply([s], planScope(s, [], '2026-10-03', 'following', { kind: 'delete' }, id, 'now')), '2026-10-01', '2026-10-06');
    expect(next.map((i) => i.date)).toEqual(['2026-10-01', '2026-10-02']);
    const all = expandItems(apply([s], planScope(s, [], '2026-10-03', 'all', { kind: 'delete' }, id, 'now')), '2026-10-01', '2026-10-06');
    expect(all).toEqual([]);
  });
});
