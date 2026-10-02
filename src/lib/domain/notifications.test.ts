import { describe, expect, it } from 'vitest';
import { makeTask } from '@/db/defaults';
import type { ScheduledNotification, TimeEntry } from '@/db/types';
import { buildSchedule, keyToUuid, reconcile, type ScheduleInput } from './notifications';
import { atLocal } from '../time';
import { defaultSettings } from '@/state/settings';

const text = (k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ''}`;
const now = atLocal('2026-10-02', '08:00').toISOString();
const base = (p: Partial<ScheduleInput> = {}): ScheduleInput => ({ raw: [], entries: [], sessions: [], importantDates: [], decisions: [], goals: [], settings: defaultSettings('u'), now, text, ...p });
const at = (d: string, h: string) => atLocal(d, h).toISOString();

describe('notification schedule (14, N1)', () => {
  it('start, leave and event outcome', () => {
    const task = makeTask({ id: 't', title: 'Treino', date: '2026-10-02', plannedStart: '10:00', travelMinutes: 20 });
    const ev = makeTask({ id: 'e', kind: 'event', title: 'Dentista', date: '2026-10-02', plannedStart: '15:00', plannedEnd: '15:30' });
    const s = buildSchedule(base({ raw: [task, ev] }));
    expect(s.find((x) => x.key === 'start:t')).toMatchObject({ send_at: at('2026-10-02', '10:00'), body: 'notifText.start{"task":"Treino"}' });
    expect(s.find((x) => x.key === 'leave:t')!.send_at).toBe(at('2026-10-02', '09:40'));
    expect(s.find((x) => x.key === 'outcome:e')!.send_at).toBe(at('2026-10-02', '15:30'));
  });
  it('overtime only while the timer runs', () => {
    const task = makeTask({ id: 'r', title: 'Escrever', plannedMinutes: 30 });
    const running: TimeEntry = { id: 'x', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, start: at('2026-10-02', '07:50'), end: null, activity: 'Escrever', areaId: null, classification: 'essential', taskId: 'r', locationId: null, source: 'timer' };
    expect(buildSchedule(base({ raw: [task], entries: [running] })).find((x) => x.type === 'overtime')!.send_at).toBe(at('2026-10-02', '08:20'));
    expect(buildSchedule(base({ raw: [task], entries: [{ ...running, end: now }] })).find((x) => x.type === 'overtime')).toBeUndefined();
  });
  it('deadline the evening before at 18:00 and the day at 9:00 (deferrable)', () => {
    const t = makeTask({ id: 'd', title: 'Relatório', deadline: at('2026-10-05', '17:00') });
    const s = buildSchedule(base({ raw: [t] })).filter((x) => x.type === 'deadline');
    expect(s.map((x) => x.send_at)).toEqual([at('2026-10-04', '18:00'), at('2026-10-05', '09:00')]);
    expect(s.every((x) => x.deferrable)).toBe(true);
  });
  it('plan tomorrow 1 h before bedtime, or at the chosen time; weekly review on Sunday at 20:00', () => {
    const s1 = buildSchedule(base({ settings: { ...defaultSettings('u'), sleepTarget: '23:30' } }));
    expect(s1.find((x) => x.key === 'plan:2026-10-02')!.send_at).toBe(at('2026-10-02', '22:30'));
    const s2 = buildSchedule(base());
    expect(s2.find((x) => x.key === 'plan:2026-10-02')!.send_at).toBe(at('2026-10-02', '22:00'));
    expect(s2.find((x) => x.type === 'weeklyReview')!.send_at).toBe(at('2026-10-04', '20:00'));
  });
  it('switches off by type; good morning only with a fixed schedule', () => {
    const off = { ...defaultSettings('u'), notifications: { ...defaultSettings('u').notifications, planTomorrow: false } };
    expect(buildSchedule(base({ settings: off })).some((x) => x.type === 'planTomorrow')).toBe(false);
    expect(buildSchedule(base()).some((x) => x.type === 'goodMorning')).toBe(false);
    const fixed = { ...defaultSettings('u'), wakeTarget: '07:00', sleepTarget: '23:00', fixedSchedule: true, notifications: { ...defaultSettings('u').notifications, goodMorning: true } };
    expect(buildSchedule(base({ settings: fixed })).find((x) => x.key === 'gm:2026-10-03')!.send_at).toBe(at('2026-10-03', '07:00'));
  });
  it('important dates, decision review and logging session reminders', () => {
    const idate = { id: 'i', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, name: 'Aniversário', date: '2026-10-08', yearly: true, areaId: null, reminders: [7, 1], todos: [] };
    const dec = { id: 'k', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, text: 'Mudar', areaId: null, date: '2026-09-20', impact: 'high' as const, reversibility: 'hard' as const, approach: 'advice' as const, minutes: null, info: '', askedWho: '', reviewAt: '2026-10-04', reviewOutcome: null, reviewLearned: '' };
    const ses = { id: 's', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, start: at('2026-10-02', '07:00'), end: at('2026-10-02', '09:00'), reminderMinutes: 30, thieves: [] };
    const s = buildSchedule(base({ importantDates: [idate], decisions: [dec], sessions: [ses] }));
    expect(s.find((x) => x.key === 'idate:i:2026-10-08:1')).toMatchObject({ send_at: at('2026-10-07', '09:00'), body: 'notifText.dateTomorrow{"date":"Aniversário"}' });
    expect(s.find((x) => x.key === 'idate:i:2026-10-08:7')).toBeUndefined(); // 1 Oct is in the past
    expect(s.find((x) => x.type === 'decisionReview')!.body).toBe('notifText.decisionReview{"n":14,"decision":"Mudar"}');
    expect(s.filter((x) => x.type === 'session').map((x) => x.send_at)).toEqual([at('2026-10-02', '08:00'), at('2026-10-02', '08:30')]);
  });
});

describe('reconcile (14.2, N1)', () => {
  const row = (p: Partial<ScheduledNotification>): ScheduledNotification => ({ id: 'x', user_id: 'u', created_at: '', updated_at: '', deleted_at: null, type: 'start', send_at: at('2026-10-02', '10:00'), title: 'MarTime', body: 'b', url: '#/hoje', status: 'pending', key: 'k', deferrable: false, ...p });
  it('creates, recalculates and cancels', () => {
    const desired = [{ key: 'start:a', type: 'start' as const, send_at: at('2026-10-02', '11:00'), body: 'b', url: '#/hoje', deferrable: false }];
    const idA = keyToUuid('u|start:a');
    expect(reconcile([], desired, 'u', now).create).toHaveLength(1);
    const moved = reconcile([row({ id: idA })], desired, 'u', now);
    expect(moved.update).toEqual([{ id: idA, patch: expect.objectContaining({ send_at: at('2026-10-02', '11:00'), status: 'pending' }) }]);
    const gone = reconcile([row({ id: 'other' })], [], 'u', now);
    expect(gone.update).toEqual([{ id: 'other', patch: { status: 'cancelled' } }]);
  });
  it('never touches sent or deferred notifications', () => {
    const desired = [{ key: 'start:a', type: 'start' as const, send_at: at('2026-10-02', '11:00'), body: 'b', url: '#/hoje', deferrable: false }];
    const idA = keyToUuid('u|start:a');
    expect(reconcile([row({ id: idA, status: 'sent' })], desired, 'u', now)).toEqual({ create: [], update: [] });
    expect(reconcile([row({ id: 'z', status: 'deferred' })], [], 'u', now)).toEqual({ create: [], update: [] });
  });
  it('the same key gives the same id on every device', () => {
    expect(keyToUuid('u|start:a')).toBe(keyToUuid('u|start:a'));
    expect(keyToUuid('u|start:a')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
