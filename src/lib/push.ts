import { db } from '@/db/db';
import { create, update } from '@/db/repo';
import { supabase } from './supabase';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function permissionState(): PermissionState {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported';
  return Notification.permission as PermissionState;
}

function b64ToUint8(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function device(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Browser';
}

/** Must be called from a button tap (iOS requirement). */
export async function enableNotifications(): Promise<PermissionState> {
  if (permissionState() === 'unsupported') return 'unsupported';
  const p = await Notification.requestPermission();
  if (p !== 'granted') return p as PermissionState;
  await subscribePush();
  return 'granted';
}

export async function subscribePush(): Promise<boolean> {
  if (!VAPID || !('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(VAPID) });
  const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
  const existing = (await db.pushSubs.toArray()).find((s) => s.endpoint === json.endpoint);
  if (existing) {
    if (existing.deleted_at) await update('pushSubs', existing.id, { deleted_at: null });
  } else await create('pushSubs', { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device: device() });
  return true;
}

/** Sends the test notification through the Edge Function (N3). */
export async function sendTestNotification(lang: string): Promise<{ ok: boolean; sent: number }> {
  if (!supabase) return { ok: false, sent: 0 };
  await subscribePush().catch(() => false);
  // make sure the subscription reached the server before asking for the push
  const { syncNowGlobal } = await import('@/db/syncHandle');
  await syncNowGlobal();
  const { data, error } = await supabase.functions.invoke('send-notifications', { body: { test: true, lang } });
  if (error) return { ok: false, sent: 0 };
  return { ok: true, sent: (data as { sent?: number })?.sent ?? 0 };
}
