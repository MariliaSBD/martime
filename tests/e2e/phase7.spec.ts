import { test, expect, signUp, lisbon, createTask, openCreate, goTab, startDay, seed, readStore, card, isMobile } from './fixtures';
import pt from '../../src/i18n/pt-PT.json' with { type: 'json' };
import en from '../../src/i18n/en.json' with { type: 'json' };
import type { Page } from '@playwright/test';

const ALL = ['Hoje', 'Calendário', 'Tarefas', 'Objetivos', 'Revisão'];

test('G2 the "+" menu is on every tab and creates each of the 7 types', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  for (const tab of ALL) {
    await goTab(page, tab);
    await expect(page.getByRole('button', { name: 'Criar', exact: true }).last()).toBeVisible();
  }
  await goTab(page, 'Hoje');
  await createTask(page, { title: 'Tarefa G2' });
  await openCreate(page, 'Compromisso');
  let d = page.getByRole('dialog');
  await d.getByLabel('Título').fill('Compromisso G2');
  await d.getByLabel('Início', { exact: true }).fill('15:00');
  await d.getByLabel('Fim', { exact: true }).fill('16:00');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(card(page, 'Compromisso G2')).toBeVisible();
  await openCreate(page, 'Objetivo');
  await page.getByRole('dialog').getByLabel('O quê, exatamente?').fill('Objetivo G2');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Objetivo G2' })).toBeVisible();
  await goTab(page, 'Tarefas');
  await openCreate(page, 'Projeto');
  await page.getByRole('dialog').getByLabel('Nome').fill('Projeto G2');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL(/#\/projeto\//);
  await goTab(page, 'Revisão');
  await openCreate(page, 'Decisão');
  await page.getByRole('dialog').getByLabel('Decisão').fill('Decisão G2');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await openCreate(page, 'Reflexão');
  await page.getByRole('dialog').getByLabel('Situação').fill('Reflexão G2');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await goTab(page, 'Calendário');
  await openCreate(page, 'Data importante');
  d = page.getByRole('dialog');
  await d.getByLabel('Nome').fill('Data G2');
  await expect(d.getByLabel('Data')).toHaveValue('2026-10-02');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL(/#\/data\//);
  const counts = await Promise.all(['tasks', 'goals', 'projects', 'decisions', 'reflections', 'importantDates'].map((s) => readStore(page, s).then((r) => r.length)));
  expect(counts).toEqual([2, 1, 1, 1, 1, 1]);
});

/** Visible text lines of the page. */
async function lines(page: Page): Promise<string[]> {
  const text = await page.locator('body').innerText();
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

const INSTRUCTION = /^(Toca|Clica|Carrega|Usa |Aqui podes|Podes |Para (criar|adicionar|começar)|Seleciona|Arrasta|Desliza)/i;

test('G4 no instruction texts on any screen', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await createTask(page, { title: 'Ler' });
  const routes = ['#/hoje', '#/calendario?v=year', '#/calendario?v=month', '#/calendario?v=week', '#/calendario?v=day', '#/tarefas', '#/objetivos', '#/revisao?t=stats', '#/revisao?t=diary', '#/revisao?t=weeks', '#/revisao?t=reports', '#/formacao', '#/definicoes'];
  for (const r of routes) {
    await page.goto(`./${r}`);
    await page.waitForTimeout(200);
    for (const l of await lines(page)) {
      expect(INSTRUCTION.test(l), `${r}: ${l}`).toBe(false);
      if (l.startsWith('Instala a MarTime') || /^[\d: ]+$/.test(l)) continue;
      expect(l.length, `${r}: ${l}`).toBeLessThanOrEqual(110);
    }
  }
});

function flat(o: Record<string, unknown>, out: Record<string, string> = {}, p = ''): Record<string, string> {
  for (const [k, v] of Object.entries(o)) {
    const key = p ? `${p}.${k}` : k;
    if (typeof v === 'object' && v) flat(v as Record<string, unknown>, out, key);
    else out[key] = String(v);
  }
  return out;
}

test('G5 PT | EN changes every visible text', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await createTask(page, { title: 'XYZ' });
  const p = flat(pt);
  const e = new Set(Object.values(flat(en)));
  const ptOnly = new Set(Object.entries(p).filter(([k, v]) => !k.startsWith('areas.defaults') && !k.startsWith('holidays.') && !e.has(v) && !v.includes('{{') && v.length > 2).map(([, v]) => v));
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  for (const r of ['#/hoje', '#/calendario?v=month', '#/tarefas', '#/objetivos', '#/revisao?t=stats', '#/revisao?t=reports', '#/definicoes']) {
    await page.goto(`./${r}`);
    await page.waitForTimeout(200);
    const left = (await lines(page)).filter((l) => ptOnly.has(l));
    expect(left, r).toEqual([]);
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('G7 without internet, create, edit and delete work', async ({ page, context }) => {
  await signUp(page);
  await context.setOffline(true);
  await createTask(page, { title: 'Offline' });
  await card(page, 'Offline').getByText('Offline', { exact: true }).click();
  await page.getByLabel('Título').fill('Offline editada');
  await page.getByLabel('Título').blur();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(card(page, 'Offline editada')).toBeVisible();
  await card(page, 'Offline editada').getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Apagar' }).click();
  await expect(page.locator('main li').filter({ hasText: 'Offline editada' })).toHaveCount(0);
  await context.setOffline(false);
});

test('D1 settings are saved', async ({ page }) => {
  await signUp(page);
  await page.goto('./#/definicoes');
  await page.getByLabel('Nome', { exact: true }).first().fill('Ana Teste');
  await page.getByLabel('Curso', { exact: true }).fill('Curso X');
  await page.getByLabel('Módulo', { exact: true }).fill('Módulo Y');
  await page.getByLabel('Módulo', { exact: true }).blur();
  await page.getByRole('radio', { name: /C\. Tropical/ }).click();
  await page.getByRole('switch', { name: 'Planear amanhã' }).click();
  await page.getByLabel('Hora alvo de acordar').fill('07:00');
  await page.getByLabel('Hora alvo de dormir').fill('23:00');
  await page.getByRole('switch', { name: 'Horário fixo' }).click();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByLabel('Nome', { exact: true }).first()).toHaveValue('Ana Teste');
  await expect(page.getByLabel('Curso', { exact: true })).toHaveValue('Curso X');
  await expect(page.getByRole('radio', { name: /C\. Tropical/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Planear amanhã' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('switch', { name: 'Horário fixo' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('switch', { name: 'Bom dia' })).toHaveAttribute('aria-checked', 'true');
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim());
  expect(bg.toUpperCase()).toBe('#0F766E');
});

test('D2 deleting an area with items asks where to move them', async ({ page }) => {
  await signUp(page);
  await createTask(page, { title: 'Da área Pessoal' });
  await page.goto('./#/definicoes');
  await page.getByRole('button', { name: 'Apagar', exact: true }).first().click();
  const d = page.getByRole('dialog', { name: 'Apagar área' });
  await expect(d).toContainText('Esta área tem 1 item');
  await d.getByLabel('Mover para').selectOption({ label: 'Casa' });
  await d.getByRole('button', { name: 'Mover e apagar' }).click();
  await expect(page.getByLabel('Nome', { exact: true }).nth(1)).not.toHaveValue('Pessoal');
  await page.goto('./#/hoje');
  await expect(card(page, 'Da área Pessoal')).toContainText('Casa');
});

test('D3 first use: 4 steps with optional skips', async ({ page }) => {
  await signUp(page, { keepOnboarding: true });
  await expect(page.getByText('Passo 1 de 4')).toBeVisible();
  await expect(page.getByLabel('Nome')).toHaveCount(7);
  await page.getByPlaceholder('Ex.: Voluntariado').fill('Voluntariado');
  await page.getByRole('button', { name: 'Adicionar' }).click();
  await expect(page.getByLabel('Nome')).toHaveCount(8);
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.getByText('Passo 2 de 4')).toBeVisible();
  await page.getByRole('button', { name: 'Adicionar bloco' }).click();
  await page.getByLabel('Nome').fill('Manhã');
  await page.getByLabel('Início').fill('08:00');
  await page.getByLabel('Fim').fill('12:00');
  await page.getByRole('button', { name: 'Criar' }).click();
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.getByText('Passo 3 de 4')).toBeVisible();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByText('Passo 4 de 4')).toBeVisible();
  await expect(page.getByRole('button', { name: /Ativar notificações|Notificações/ }).or(page.getByText(/notificações/i)).first()).toBeVisible();
  await page.getByRole('button', { name: 'Agora não' }).click();
  await expect(page).toHaveURL(/#\/hoje/);
  await expect(page.getByText('Ainda sem tarefas')).toBeVisible();
});

test('D4 recover the password with the 6-digit code; D5 closed sign-ups show only "Entrar"', async ({ page }) => {
  await signUp(page);
  const email = await page.evaluate(() => JSON.parse(localStorage.getItem('martime.local.session')!).email as string);
  await page.goto('./#/definicoes');
  await page.getByRole('button', { name: 'Terminar sessão' }).click();
  await page.getByRole('button', { name: 'Esqueci-me da palavra-passe' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('martime.local.resetCode')!).code as string);
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel('Código de 6 dígitos').fill('000000' === code ? '111111' : '000000');
  await page.getByLabel('Nova palavra-passe').fill('novasenha99');
  await page.getByRole('button', { name: 'Guardar palavra-passe' }).click();
  await expect(page.getByRole('alert')).toContainText('Código incorreto ou expirado.');
  await page.getByLabel('Código de 6 dígitos').fill(code);
  await page.getByRole('button', { name: 'Guardar palavra-passe' }).click();
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible();
  // D5
  await page.evaluate(() => localStorage.setItem('martime.local.registrationsClosed', '1'));
  await page.goto('./#/definicoes');
  await page.getByRole('button', { name: 'Terminar sessão' }).click();
  await expect(page.getByRole('button', { name: 'Entrar' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Criar conta' })).toHaveCount(0);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Palavra-passe').fill('novasenha99');
  await page.getByRole('button', { name: 'Entrar' }).first().click();
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible();
});

test('N1 scheduled notifications are created, recalculated and cancelled', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T09:00'));
  await signUp(page);
  await createTask(page, { title: 'Com lembrete', start: '10:00', duration: 30 });
  await expect.poll(async () => (await readStore<{ type: string; status: string; send_at: string }>(page, 'notifications')).filter((n) => n.type === 'start' && n.status === 'pending').map((n) => n.send_at)).toEqual([lisbon('2026-10-02T10:00').toISOString()]);
  await card(page, 'Com lembrete').getByText('Com lembrete', { exact: true }).click();
  await page.getByLabel('Início previsto').fill('11:00');
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect.poll(async () => (await readStore<{ type: string; status: string; send_at: string }>(page, 'notifications')).filter((n) => n.type === 'start' && n.status === 'pending').map((n) => n.send_at)).toEqual([lisbon('2026-10-02T11:00').toISOString()]);
  // start → "tempo previsto terminado" scheduled; pause → cancelled
  await card(page, 'Com lembrete').getByRole('button', { name: 'Iniciar' }).click();
  await expect.poll(async () => (await readStore<{ type: string; status: string }>(page, 'notifications')).filter((n) => n.type === 'overtime' && n.status === 'pending').length).toBe(1);
  await page.getByTestId('now-card').getByRole('button', { name: 'Pausar' }).click();
  await expect.poll(async () => (await readStore<{ type: string; status: string }>(page, 'notifications')).filter((n) => n.type === 'overtime').map((n) => n.status)).toEqual(['cancelled']);
});

test('N2 reminders kept during the silence appear in "Enquanto descansavas"; suggestions appear and can be dismissed', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-20T08:00'));
  await signUp(page);
  const user = await page.evaluate(() => JSON.parse(localStorage.getItem('martime.local.session')!).userId as string);
  const base = { user_id: user, created_at: '2026-10-19T23:00:00.000Z', updated_at: '2026-10-19T23:00:00.000Z', deleted_at: null };
  await seed(page, 'notifications', [{ ...base, id: 'n1', type: 'deadline', send_at: '2026-10-19T23:00:00.000Z', title: 'MarTime', body: 'O prazo de Relatório é amanhã.', url: '#/hoje', status: 'deferred', key: 'k1', deferrable: true }]);
  // 15 days of energy records with high energy 9–11h and an activity done 3×/week for 2 weeks
  const tasks = [];
  for (let d = 1; d <= 16; d++) {
    const day = `2026-10-${String(d + 3).padStart(2, '0')}`;
    for (const h of ['09:10', '10:10']) tasks.push({ ...base, id: `e${d}${h}`, kind: 'task', title: `Foco ${d}${h}`, areaId: '', date: day, plannedMinutes: 30, status: 'done', completedAt: lisbon(`${day}T${h}`).toISOString(), energyAtDone: 'high', history: [], repeat: null, seriesId: null, occurrenceDate: null });
  }
  const entries = ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-14', '2026-10-16'].map((day, i) => ({ ...base, id: `a${i}`, start: lisbon(`${day}T07:00`).toISOString(), end: lisbon(`${day}T07:20`).toISOString(), activity: 'Alongamentos', areaId: null, classification: 'useful', taskId: null, locationId: null, source: 'free' }));
  await seed(page, 'tasks', tasks);
  await seed(page, 'timeEntries', entries);
  await page.reload();
  await expect(page.getByTestId('rested')).toHaveCount(0);
  await startDay(page);
  await expect(page.getByTestId('rested')).toContainText('O prazo de Relatório é amanhã.');
  await page.getByTestId('rested').getByRole('button', { name: 'Visto' }).click();
  await expect(page.getByTestId('rested')).toHaveCount(0);
  await expect(page.getByTestId('energy-suggestion')).toContainText('entre 09:00 e 11:00');
  await page.getByTestId('energy-suggestion').getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByTestId('energy-suggestion')).toHaveCount(0);
  expect((await readStore<{ start: string; end: string }>(page, 'energyBlocks')).map((b) => `${b.start}-${b.end}`)).toEqual(['09:00-11:00']);
  await expect(page.getByTestId('routine-suggestion')).toContainText('Fazes Alongamentos várias vezes por semana.');
  await page.getByTestId('routine-suggestion').getByRole('button', { name: 'Agora não' }).click();
  await expect(page.getByTestId('routine-suggestion')).toHaveCount(0);
  if (!isMobile(page)) await goTab(page, 'Hoje');
});
