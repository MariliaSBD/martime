import { db } from '@/db/db';
import { getRepoUser, update } from '@/db/repo';
import type { NotificationType, Settings } from '@/db/types';

export const NOTIFICATION_TYPES: NotificationType[] = [
  'start',
  'overtime',
  'leave',
  'deadline',
  'importantDate',
  'planTomorrow',
  'weeklyReview',
  'decisionReview',
  'eventOutcome',
  'session',
  'goodMorning',
  'goalReview',
];

export function defaultSettings(userId: string): Settings {
  const epoch = '1970-01-01T00:00:00.000Z';
  return {
    id: userId,
    user_id: userId,
    created_at: epoch,
    updated_at: epoch, // any version from the server wins over these defaults
    deleted_at: null,
    name: '',
    course: '',
    module: '',
    language: 'pt-PT',
    palette: 'A',
    wakeTarget: null,
    sleepTarget: null,
    fixedSchedule: false,
    notifications: Object.fromEntries(NOTIFICATION_TYPES.map((t) => [t, t !== 'goodMorning'])) as Record<NotificationType, boolean>,
    sessionReminderMinutes: 30,
    planTomorrowTime: '22:00',
    lastAreaId: null,
    onboarded: false,
    energySuggestionShownAt: null,
    routineSuggestionsDismissed: {},
  };
}

/** Settings live in one record whose id is the user id. */
export async function ensureSettings(userId: string): Promise<void> {
  const cur = await db.settings.get(userId);
  if (!cur) await db.settings.put(defaultSettings(userId));
}

export async function loadSettings(): Promise<Settings> {
  const id = getRepoUser() ?? 'local';
  const s = await db.settings.get(id);
  return { ...defaultSettings(id), ...(s ?? {}), notifications: { ...defaultSettings(id).notifications, ...(s?.notifications ?? {}) } };
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const id = getRepoUser() ?? 'local';
  await ensureSettings(id);
  await update('settings', id, patch);
}
