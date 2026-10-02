import { db } from '@/db/db';
import { create, getRepoUser, onLocalChange, update } from '@/db/repo';
import { buildSchedule, reconcile } from '@/lib/domain/notifications';
import { nowIso } from '@/lib/time';
import i18n from '@/i18n';
import { loadSettings } from '../settings';

let running = false;
let again = false;

/** 14.2: recalculates the next 7 days of notifications whenever something related changes. */
export async function recomputeNotifications(): Promise<void> {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    do {
      again = false;
      const user = getRepoUser();
      if (!user) return;
      const settings = await loadSettings();
      const live = <T extends { deleted_at: string | null }>(xs: T[]) => xs.filter((x) => !x.deleted_at);
      const [raw, entries, sessions, importantDates, decisions, goals, existing] = await Promise.all([db.tasks.toArray(), db.timeEntries.toArray(), db.sessions.toArray(), db.importantDates.toArray(), db.decisions.toArray(), db.goals.toArray(), db.notifications.toArray()]);
      const tt = i18n.getFixedT(settings.language);
      const now = nowIso();
      const desired = buildSchedule({ raw, entries: live(entries), sessions: live(sessions), importantDates: live(importantDates), decisions: live(decisions), goals: live(goals), settings, now, text: (k, v) => tt(k, v) });
      const plan = reconcile(existing, desired, user, now);
      for (const c of plan.create) await create('notifications', { id: c.id, type: c.type, send_at: c.send_at, title: 'MarTime', body: c.body, url: c.url, status: 'pending', key: c.key, deferrable: c.deferrable, released_at: null });
      for (const u of plan.update) await update('notifications', u.id, u.patch);
    } while (again);
  } finally {
    running = false;
  }
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Starts recalculating after local changes (debounced) and once a minute. */
export function startScheduler(): () => void {
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void recomputeNotifications(), 1500);
  };
  const off = onLocalChange(schedule);
  const iv = setInterval(() => void recomputeNotifications(), 60000);
  void recomputeNotifications();
  return () => {
    off();
    clearInterval(iv);
    if (timer) clearTimeout(timer);
  };
}
