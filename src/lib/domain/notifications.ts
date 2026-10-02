import type { Decision, Goal, ImportantDate, LogSession, NotificationType, ScheduledNotification, Settings, Task, TimeEntry } from '@/db/types';
import { addDays, atLocal, dateKey, diffDays, hhmmToMinutes, isoWeekday, minutesToHHMM, toDate, weekStart } from '../time';
import { expandItems } from './recurrence';
import { taskTimer } from './timeEntries';
import { occurrencesOf } from './importantDates';
import { DEFERRABLE } from './silence';

export interface Planned {
  key: string;
  type: NotificationType;
  send_at: string;
  body: string;
  url: string;
  deferrable: boolean;
}

export type TextFn = (key: string, vars?: Record<string, string | number>) => string;

export interface ScheduleInput {
  raw: Task[];
  entries: TimeEntry[];
  sessions: LogSession[];
  importantDates: ImportantDate[];
  decisions: Decision[];
  goals: Goal[];
  settings: Pick<Settings, 'notifications' | 'sleepTarget' | 'wakeTarget' | 'fixedSchedule' | 'planTomorrowTime'>;
  now: string;
  text: TextFn;
}

const WINDOW_DAYS = 7;

/** 14.2: notifications for the next 7 days. */
export function buildSchedule(input: ScheduleInput): Planned[] {
  const { now, text, settings } = input;
  const nowT = toDate(now).getTime();
  const endT = nowT + WINDOW_DAYS * 86400000;
  const today = dateKey(now);
  const last = addDays(today, WINDOW_DAYS);
  const out: Planned[] = [];
  const add = (type: NotificationType, key: string, at: Date | string, body: string, url: string) => {
    const t = toDate(at).getTime();
    if (t < nowT - 30000 || t > endT) return;
    if (!settings.notifications[type]) return;
    out.push({ key, type, send_at: new Date(t).toISOString(), body, url, deferrable: DEFERRABLE.has(type) });
  };
  const items = expandItems(input.raw, today, last);
  const itemUrl = (id: string) => `#/tarefa/${encodeURIComponent(id)}`;

  for (const it of items) {
    if (!it.date || !it.plannedStart) continue;
    const start = atLocal(it.date, it.plannedStart);
    if (it.kind === 'task' && it.status === 'pending' && it.reminder) add('start', `start:${it.id}`, start, text('notifText.start', { task: it.title }), itemUrl(it.id));
    const pending = it.kind === 'task' ? it.status === 'pending' : !it.eventStatus && !it.arrivedAt;
    if (pending && it.travelMinutes > 0) add('leave', `leave:${it.id}`, new Date(start.getTime() - it.travelMinutes * 60000), text('notifText.leave', { item: it.title }), itemUrl(it.id));
    if (it.kind === 'event' && !it.eventStatus && !it.arrivedAt && it.plannedEnd) add('eventOutcome', `outcome:${it.id}`, atLocal(it.date, it.plannedEnd), text('notifText.eventOutcome', { event: it.title }), '#/hoje');
  }

  // overtime: only while the timer runs (pausing or completing cancels it; resuming reschedules)
  for (const e of input.entries) {
    if (e.end || e.deleted_at || e.source !== 'timer' || !e.taskId) continue;
    const task = input.raw.find((t) => t.id === e.taskId);
    if (!task) continue;
    const real = taskTimer(task, input.entries, now).realMinutes;
    const planned = task.plannedMinutes || 30;
    if (real < planned) add('overtime', `overtime:${task.id}:${e.id}`, new Date(nowT + (planned - real) * 60000), text('notifText.overtime', { task: task.title }), '#/hoje');
  }

  // deadlines: the evening before at 18:00 and on the day at 9:00
  for (const t of input.raw) {
    if (t.deleted_at || !t.deadline || t.status === 'done' || t.kind !== 'task') continue;
    const d = dateKey(t.deadline);
    add('deadline', `deadline:eve:${t.id}:${t.deadline}`, atLocal(addDays(d, -1), '18:00'), text('notifText.deadlineEve', { task: t.title }), itemUrl(t.id));
    add('deadline', `deadline:day:${t.id}:${t.deadline}`, atLocal(d, '09:00'), text('notifText.deadlineDay', { task: t.title }), itemUrl(t.id));
  }

  // important dates, at 9:00 on each reminder day
  for (const d of input.importantDates) {
    if (d.deleted_at) continue;
    const maxBefore = Math.max(0, ...d.reminders);
    for (const occ of occurrencesOf(d, today, addDays(last, maxBefore))) {
      for (const r of d.reminders) {
        const body = r === 0 ? text('notifText.dateToday', { date: d.name }) : r === 1 ? text('notifText.dateTomorrow', { date: d.name }) : text('notifText.dateIn', { date: d.name, n: r });
        add('importantDate', `idate:${d.id}:${occ}:${r}`, atLocal(addDays(occ, -r), '09:00'), body, `#/data/${d.id}`);
      }
    }
  }

  for (let day = today; day <= last; day = addDays(day, 1)) {
    // plan tomorrow: 1 h before the target bedtime; without it, at the chosen time
    if (settings.sleepTarget) {
      const m = hhmmToMinutes(settings.sleepTarget) - 60;
      const onDay = hhmmToMinutes(settings.sleepTarget) < 12 * 60 ? addDays(day, 1) : day;
      const at = m < 0 ? atLocal(addDays(onDay, -1), minutesToHHMM(m + 1440)) : atLocal(onDay, minutesToHHMM(m));
      add('planTomorrow', `plan:${day}`, at, text('notifText.planTomorrow'), '#/hoje');
    } else add('planTomorrow', `plan:${day}`, atLocal(day, settings.planTomorrowTime), text('notifText.planTomorrow'), '#/hoje');
    // weekly review: Sunday at 20:00
    if (isoWeekday(day) === 7) add('weeklyReview', `weekly:${weekStart(day)}`, atLocal(day, '20:00'), text('notifText.weeklyReview'), `#/semana/${weekStart(day)}`);
    // good morning: only with a fixed schedule
    if (settings.fixedSchedule && settings.wakeTarget) {
      const its = items.filter((i) => i.date === day);
      add('goodMorning', `gm:${day}`, atLocal(day, settings.wakeTarget), text('notifText.goodMorning', { n: its.filter((i) => i.kind === 'task').length, m: its.filter((i) => i.kind === 'event').length }), '#/hoje');
    }
  }

  for (const d of input.decisions) {
    if (d.deleted_at || !d.reviewAt || d.reviewOutcome) continue;
    add('decisionReview', `decision:${d.id}:${d.reviewAt}`, atLocal(d.reviewAt, '18:00'), text('notifText.decisionReview', { n: diffDays(d.date, d.reviewAt), decision: d.text }), `#/decisao/${d.id}`);
  }

  for (const g of input.goals) {
    if (g.deleted_at || g.status !== 'active') continue;
    for (const r of g.reviews) if (!r.how && !r.adjust) add('goalReview', `goal:${g.id}:${r.id}:${r.date}`, atLocal(r.date, '18:00'), text('notifText.goalReview', { goal: g.what }), `#/objetivo/${g.id}`);
  }

  // logging sessions: every N minutes while the session lasts
  const running = input.entries.find((e) => !e.end && !e.deleted_at && (e.source === 'free' || e.source === 'timer'));
  for (const s of input.sessions) {
    if (s.deleted_at) continue;
    const step = Math.max(5, s.reminderMinutes) * 60000;
    const sT = toDate(s.start).getTime();
    const eT = toDate(s.end).getTime();
    for (let k = 1, t = sT + step; t < eT && t <= endT; k++, t += step) {
      if (t < nowT) continue;
      add('session', `session:${s.id}:${k}`, new Date(t), running ? text('notifText.sessionStill', { activity: running.activity }) : text('notifText.sessionWhat'), '#/hoje');
    }
  }

  return out.sort((a, b) => a.send_at.localeCompare(b.send_at));
}

/** Deterministic UUID from a string, so every device writes the same row for the same notification. */
export function keyToUuid(s: string): string {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [h1 ^ h2 ^ h3 ^ h4, h2 ^ h1, h3 ^ h1, h4 ^ h1].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface Reconcile {
  create: (Planned & { id: string })[];
  update: { id: string; patch: Partial<ScheduledNotification> }[];
}

/** 14.2: creates, recalculates and cancels pending notifications; never touches sent or deferred ones. */
export function reconcile(existing: ScheduledNotification[], desired: Planned[], userId: string, now: string): Reconcile {
  const out: Reconcile = { create: [], update: [] };
  const byId = new Map(existing.map((e) => [e.id, e]));
  const wanted = new Set<string>();
  for (const d of desired) {
    const id = keyToUuid(`${userId}|${d.key}`);
    wanted.add(id);
    const cur = byId.get(id);
    if (!cur) out.create.push({ ...d, id });
    else if (cur.status === 'pending' || cur.status === 'cancelled' || cur.deleted_at) {
      if (cur.status !== 'pending' || cur.deleted_at || cur.send_at !== d.send_at || cur.body !== d.body || cur.url !== d.url) out.update.push({ id, patch: { status: 'pending', send_at: d.send_at, body: d.body, url: d.url, type: d.type, deferrable: d.deferrable, deleted_at: null } });
    }
  }
  for (const e of existing) {
    if (wanted.has(e.id) || e.status !== 'pending' || e.deleted_at || e.type === 'test') continue;
    if (toDate(e.send_at).getTime() >= toDate(now).getTime() - 60000) out.update.push({ id: e.id, patch: { status: 'cancelled' } });
  }
  return out;
}
