import { test, expect, type Browser, type Page } from '@playwright/test';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import { admin, publicKey, testUser, URL } from './admin';

async function signIn(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const u = testUser();
  await page.goto('./');
  await page.getByLabel('Email').fill(u.email);
  await page.getByLabel('Palavra-passe').fill(u.password);
  await page.getByRole('button', { name: 'Entrar' }).first().click();
  // first sign-in shows the first-use steps; later ones go straight to Hoje
  const next = page.getByRole('button', { name: 'Seguinte' });
  const fab = page.getByRole('button', { name: 'Criar', exact: true }).last();
  await expect(next.or(fab)).toBeVisible({ timeout: 30000 });
  if (await next.isVisible()) {
    await next.click();
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.getByRole('button', { name: 'Saltar' }).click();
    await page.getByRole('button', { name: 'Agora não' }).click();
  }
  await expect(page.getByRole('button', { name: 'Criar', exact: true }).last()).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('status', { name: 'Sincronizado' })).toBeVisible({ timeout: 30000 });
  return page;
}

async function synced(page: Page) {
  await expect(page.getByRole('status', { name: 'Sincronizado' })).toBeVisible({ timeout: 30000 });
}

async function addTask(page: Page, title: string, start?: string) {
  await page.getByRole('button', { name: 'Criar', exact: true }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tarefa', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Título').fill(title);
  if (start) await page.getByRole('dialog').getByLabel('Início previsto').fill(start);
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
}

const card = (page: Page, title: string) => page.locator('main li').filter({ has: page.getByText(title, { exact: true }) }).last();

test.describe.serial('sync with Supabase (4.3, G7, D1, N1, N3)', () => {
  let a: Page;
  let b: Page;

  test('a change on one device appears on the other; deleting propagates', async ({ browser }) => {
    a = await signIn(browser);
    await a.waitForTimeout(3000); // let the first use reach the server
    b = await signIn(browser);
    expect(await b.locator('input[aria-label="Nome"]').count()).toBe(0);
    await addTask(a, 'Sincronizada');
    const u = testUser();
    await expect
      .poll(async () => ((await (await admin(`/rest/v1/tasks?user_id=eq.${u.id}&select=data`)).json()) as { data: { title: string } }[]).map((r) => r.data.title), { timeout: 20000 })
      .toContain('Sincronizada');
    await b.reload();
    await expect(card(b, 'Sincronizada')).toBeVisible();
    await card(a, 'Sincronizada').getByRole('button', { name: 'Mais opções' }).click();
    await a.getByRole('menuitem', { name: 'Apagar' }).click();
    await a.waitForTimeout(2500);
    await synced(a);
    await b.reload();
    await expect(b.locator('main li').filter({ hasText: 'Sincronizada' })).toHaveCount(0);
  });

  test('conflict: the most recent updated_at wins', async () => {
    await addTask(a, 'Conflito');
    await a.waitForTimeout(2500);
    await synced(a);
    await b.reload();
    await expect(card(b, 'Conflito')).toBeVisible();
    // B goes offline and edits first (older); A edits later online (newer)
    await b.context().setOffline(true);
    await card(b, 'Conflito').getByText('Conflito', { exact: true }).click();
    await b.getByLabel('Título').fill('Conflito B antiga');
    await b.getByLabel('Título').blur();
    await expect(b.getByRole('status', { name: 'Sem ligação, guardado no dispositivo' })).toBeVisible();
    await a.waitForTimeout(1500);
    await card(a, 'Conflito').getByText('Conflito', { exact: true }).click();
    await a.getByLabel('Título').fill('Conflito A recente');
    await a.getByLabel('Título').blur();
    await a.waitForTimeout(2500);
    await synced(a);
    // G7: when B reconnects it syncs; its older edit loses
    await b.context().setOffline(false);
    await b.goto('./#/hoje');
    await synced(b);
    await b.reload();
    await expect(card(b, 'Conflito A recente')).toBeVisible();
  });

  test('settings sync between devices (D1)', async () => {
    await a.goto('./#/definicoes');
    await a.getByLabel('Curso', { exact: true }).fill('Curso sincronizado');
    await a.getByLabel('Curso', { exact: true }).blur();
    await a.waitForTimeout(2500);
    await synced(a);
    await b.goto('./#/definicoes');
    await b.reload();
    await expect(b.getByLabel('Curso', { exact: true })).toHaveValue('Curso sincronizado');
  });

  test('scheduled notifications are created on the server (N1)', async () => {
    await a.goto('./#/hoje');
    const d = new Date(Date.now() + 3 * 3600000);
    const hh = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Lisbon' }).format(d);
    if (hh < '02:00' || hh > '23:00') test.skip(true, 'too close to midnight for a same-day reminder');
    await addTask(a, 'Lembrete servidor', hh);
    await a.waitForTimeout(4000);
    await synced(a);
    const u = testUser();
    await expect
      .poll(async () => {
        const r = await admin(`/rest/v1/scheduled_notifications?user_id=eq.${u.id}&type=eq.start&status=eq.pending&select=body`);
        return ((await r.json()) as { body: string }[]).map((x) => x.body);
      })
      .toContain('Lembrete servidor começa agora.');
  });

  test('the test notification is sent by the Edge Function (N3)', async () => {
    // the button in Settings calls the function and records the test notification as sent
    await a.goto('./#/definicoes');
    await a.getByRole('button', { name: 'Enviar notificação de teste' }).click();
    await expect(a.getByRole('status').filter({ hasText: /Notificação de teste enviada|Não foi possível enviar/ })).toBeVisible({ timeout: 30000 });
    const u = testUser();
    const rows = (await (await admin(`/rest/v1/scheduled_notifications?user_id=eq.${u.id}&type=eq.test&select=status`)).json()) as { status: string }[];
    expect(rows.map((x) => x.status)).toContain('sent');

    // a real Web Push request: subscription on Mozilla's push service with an unknown channel
    const ecdh = createECDH('prime256v1');
    ecdh.generateKeys();
    const b64 = (b: Buffer) => b.toString('base64url');
    const subId = randomUUID();
    const now = new Date().toISOString();
    await admin('/rest/v1/push_subscriptions', { method: 'POST', body: JSON.stringify({ id: subId, user_id: u.id, created_at: now, updated_at: now, endpoint: `https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB${randomUUID().replace(/-/g, '')}`, p256dh: b64(ecdh.getPublicKey()), auth: b64(randomBytes(16)), device: 'test' }) });
    const token = (await (await fetch(`${URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: publicKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, password: u.password }) })).json()) as { access_token: string };
    const r = await fetch(`${URL}/functions/v1/send-notifications`, { method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, apikey: publicKey(), 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, lang: 'pt-PT' }) });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { sent: number; subscriptions: number };
    expect(body.subscriptions).toBeGreaterThanOrEqual(1);
    // the push service answered (gone/not found) and the function removed the dead subscription
    await expect
      .poll(async () => ((await (await admin(`/rest/v1/push_subscriptions?id=eq.${subId}&select=deleted_at`)).json()) as { deleted_at: string | null }[])[0]?.deleted_at ?? null, { timeout: 20000 })
      .not.toBeNull();
  });
});
