// Sends the scheduled notifications that are due (called every minute by pg_cron) and the test notification.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { decide, shouldRelease, type SilenceContext } from '../_shared/silence.ts';
import { TEXTS } from '../_shared/texts.ts';
import { CORS, json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails('https://mariliasbd.github.io/martime/', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

interface Sub {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function text(lang: string, key: string, vars: Record<string, string | number> = {}): string {
  const t = (TEXTS[lang] ?? TEXTS['pt-PT'])[key] ?? key;
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
}

async function push(db: SupabaseClient, subs: Sub[], payload: Record<string, unknown>): Promise<number> {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        const now = new Date().toISOString();
        await db.from('push_subscriptions').update({ deleted_at: now, updated_at: now }).eq('id', s.id);
      }
    }
  }
  return sent;
}

async function userContext(db: SupabaseClient, userId: string) {
  const [{ data: settings }, { data: days }, { data: subs }] = await Promise.all([
    db.from('settings').select('data').eq('user_id', userId).is('deleted_at', null).maybeSingle(),
    db.from('days').select('data').eq('user_id', userId).is('deleted_at', null).order('server_updated_at', { ascending: false }).limit(60),
    db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId).is('deleted_at', null),
  ]);
  const s = (settings?.data ?? {}) as { language?: string; notifications?: Record<string, boolean>; fixedSchedule?: boolean; wakeTarget?: string | null; sleepTarget?: string | null };
  const ctx: SilenceContext = {
    days: (days ?? []).map((d: { data: { startedAt: string; endedAt: string | null } }) => ({ startedAt: d.data.startedAt, endedAt: d.data.endedAt })).filter((d) => d.startedAt),
    fixed: s.fixedSchedule && s.wakeTarget && s.sleepTarget ? { wake: s.wakeTarget, sleep: s.sleepTarget } : null,
  };
  return { lang: s.language ?? 'pt-PT', toggles: s.notifications ?? {}, ctx, subs: (subs ?? []) as Sub[] };
}

async function runDue(): Promise<Record<string, number>> {
  const now = new Date();
  const nowIso = now.toISOString();
  const counts = { sent: 0, deferred: 0, dropped: 0, released: 0 };
  const { data: due } = await admin
    .from('scheduled_notifications')
    .select('*')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .lte('send_at', nowIso)
    .gte('send_at', new Date(now.getTime() - 2 * 86400000).toISOString())
    .order('send_at')
    .limit(500);
  const { data: waiting } = await admin.from('scheduled_notifications').select('user_id').eq('status', 'deferred').is('released_at', null).is('deleted_at', null).limit(500);
  const users = new Set<string>([...(due ?? []).map((n: { user_id: string }) => n.user_id), ...(waiting ?? []).map((n: { user_id: string }) => n.user_id)]);
  for (const userId of users) {
    const u = await userContext(admin, userId);
    for (const n of (due ?? []).filter((x: { user_id: string }) => x.user_id === userId)) {
      const late = now.getTime() - new Date(n.send_at).getTime() > 15 * 60000;
      let status: string;
      if (u.toggles[n.type] === false) status = 'cancelled';
      else {
        const d = decide(n.type, nowIso, u.ctx);
        if (d === 'send' && late && !n.deferrable) status = 'cancelled';
        else if (d === 'send') {
          await push(admin, u.subs, { title: 'MarTime', body: n.body, url: n.url, tag: n.id });
          status = 'sent';
          counts.sent++;
        } else if (d === 'defer') {
          status = 'deferred';
          counts.deferred++;
        } else {
          status = 'cancelled';
          counts.dropped++;
        }
      }
      await admin.from('scheduled_notifications').update({ status, updated_at: nowIso }).eq('id', n.id);
    }
    // 5.14: reminders kept during the silence go out in one notification when the day starts, or at 11:00
    const { data: deferred } = await admin.from('scheduled_notifications').select('id, send_at').eq('user_id', userId).eq('status', 'deferred').is('released_at', null).is('deleted_at', null);
    if (deferred?.length) {
      const since = deferred.map((d: { send_at: string }) => d.send_at).sort()[0];
      if (shouldRelease(since, nowIso, u.ctx)) {
        await push(admin, u.subs, { title: 'MarTime', body: text(u.lang, 'rested', { n: deferred.length }), url: '#/hoje', tag: 'rested' });
        await admin.from('scheduled_notifications').update({ released_at: nowIso, updated_at: nowIso }).in('id', deferred.map((d: { id: string }) => d.id));
        counts.released++;
      }
    }
  }
  return counts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const body = (await req.json().catch(() => ({}))) as { test?: boolean; lang?: string };

  if (body.test) {
    const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
    const { data, error } = await admin.auth.getUser(jwt);
    if (error || !data.user) return json({ error: 'unauthorized' }, 401);
    const u = await userContext(admin, data.user.id);
    const lang = body.lang === 'en' ? 'en' : body.lang === 'pt-PT' ? 'pt-PT' : u.lang;
    const sent = await push(admin, u.subs, { title: 'MarTime', body: text(lang, 'test'), url: '#/definicoes', tag: 'test' });
    const now = new Date().toISOString();
    await admin.from('scheduled_notifications').insert({ id: crypto.randomUUID(), user_id: data.user.id, created_at: now, updated_at: now, type: 'test', send_at: now, title: 'MarTime', body: text(lang, 'test'), url: '#/definicoes', status: 'sent', key: `test:${now}`, deferrable: false });
    return json({ sent, subscriptions: u.subs.length });
  }

  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return json({ error: 'forbidden' }, 403);
  return json(await runDue());
});
