import { test, expect, signUp, lisbon, createTask, openCreate, goTab, startDay, isMobile, axe } from './fixtures';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function getPdf(page: Page, click: () => Promise<void>): Promise<Buffer> {
  if (isMobile(page)) {
    // iPhone: the file goes to the share sheet; capture what is shared
    await page.evaluate(() => {
      const w = window as unknown as { __shared?: number[] };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: { files: File[] }) => { w.__shared = Array.from(new Uint8Array(await d.files[0].arrayBuffer())); } });
    });
    await click();
    await page.getByRole('dialog').getByRole('button', { name: /Partilhar ou abrir|Share or open/ }).click();
    await page.waitForFunction(() => !!(window as unknown as { __shared?: number[] }).__shared);
    const bytes = await page.evaluate(() => (window as unknown as { __shared: number[] }).__shared);
    await page.evaluate(() => delete (window as unknown as { __shared?: number[] }).__shared);
    return Buffer.from(bytes);
  }
  const dl = page.waitForEvent('download');
  await click();
  const d = await dl;
  return readFileSync((await d.path())!);
}

test('R1 the 13 statistics cards for day, week, month, year and custom', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await createTask(page, { title: 'Tarefa', duration: 60 });
  await page.getByRole('button', { name: 'Concluir Tarefa', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Minutos').fill('84');
  await page.getByRole('dialog').getByRole('button', { name: 'Concluído' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Alta', exact: true }).click();
  await goTab(page, 'Revisão');
  const ids = ['progress', 'planned', 'accuracy', 'punctuality', 'reliability', 'deadlines', 'areas', 'classes', 'thieves', 'energy', 'sleep', 'feelings', 'routines'];
  for (const id of ids) await expect(page.getByTestId(`stat-${id}`)).toBeVisible();
  await expect(page.getByTestId('stat-progress')).toContainText('100%');
  await expect(page.getByTestId('stat-planned')).toContainText('1 h · 1 h 24 min');
  await expect(page.getByTestId('stat-accuracy')).toContainText('Ainda sem dados suficientes');
  await expect(page.getByTestId('stat-energy')).toContainText('3');
  for (const p of ['Dia', 'Mês', 'Ano']) {
    await page.getByRole('radio', { name: p, exact: true }).click();
    await expect(page.getByTestId('stat-progress')).toContainText('100%');
  }
  await page.getByRole('radio', { name: 'Personalizado' }).click();
  await page.getByLabel('De', { exact: true }).fill('2026-10-03');
  await expect(page.getByTestId('stat-progress')).toContainText('Ainda sem dados suficientes');
  await axe(page);
});

test('R2 decisions: suggested approach, 2×2 map, review after 14 days', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await openCreate(page, 'Decisão');
  const d = page.getByRole('dialog');
  await d.getByLabel('Decisão').fill('Mudar de fornecedor');
  await d.getByRole('radiogroup', { name: 'Impacto' }).getByRole('radio', { name: 'Alto' }).click();
  await d.getByRole('radiogroup', { name: 'Reversibilidade' }).getByRole('radio', { name: 'Difícil de desfazer' }).click();
  await expect(d.getByRole('radiogroup', { name: 'Abordagem' }).getByRole('radio', { name: 'Pedir parecer' })).toHaveAttribute('aria-checked', 'true');
  await expect(d.getByLabel('Rever em')).toHaveValue('2026-10-16');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await openCreate(page, 'Decisão');
  await page.getByRole('dialog').getByLabel('Decisão').fill('Almoço de equipa');
  await expect(page.getByRole('dialog').getByRole('radio', { name: 'Decidir rápido' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await goTab(page, 'Revisão');
  await page.getByRole('radio', { name: 'Diário' }).click();
  await page.getByRole('radio', { name: 'Mapa' }).click();
  await expect(page.getByRole('region', { name: 'Impacto alto, Difícil de desfazer' })).toContainText('Mudar de fornecedor');
  await expect(page.getByRole('region', { name: 'Impacto baixo, Fácil de desfazer' })).toContainText('Almoço de equipa');
  await page.clock.setFixedTime(lisbon('2026-10-16T19:00'));
  await page.getByRole('button', { name: 'Mudar de fornecedor' }).click();
  await expect(page.getByTestId('decision-review')).toContainText('Está na hora de rever');
  await page.getByRole('radio', { name: 'Assim-assim' }).click();
  await expect(page.getByRole('radio', { name: 'Assim-assim' })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('decision-review').getByLabel('O que aprendi?').fill('Pedir dois orçamentos');
  await page.getByTestId('decision-review').getByLabel('O que aprendi?').blur();
  await page.waitForTimeout(300);
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Assim-assim' })).toHaveAttribute('aria-checked', 'true');
});

test('R3 reflections keep every field', async ({ page }) => {
  await signUp(page);
  await openCreate(page, 'Reflexão');
  const d = page.getByRole('dialog');
  await d.getByLabel('Situação').fill('Pedido urgente da chefe');
  await d.getByLabel('Tipo').selectOption({ label: 'Prazo impossível' });
  await d.getByRole('radio', { name: 'Role-play' }).click();
  await d.getByRole('radio', { name: /Assertiva/ }).click();
  await expect(d.getByRole('radio', { name: /Assertiva/ })).toContainText('digo o que preciso, com clareza e respeito');
  await d.getByLabel('O que fiz ou disse').fill('Propus outro prazo');
  await d.getByLabel('Raciocínio').fill('Qualidade');
  await d.getByLabel('Como correu').fill('Aceitou');
  await d.getByLabel('O que faria diferente').fill('Falar mais cedo');
  await d.getByLabel('Feedback recebido').fill('Bom tom');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await goTab(page, 'Revisão');
  await page.getByRole('radio', { name: 'Diário' }).click();
  await page.getByRole('radio', { name: 'Reflexões' }).click();
  await page.getByRole('button', { name: /Pedido urgente da chefe/ }).click();
  for (const [l, v] of [['O que fiz ou disse', 'Propus outro prazo'], ['Raciocínio', 'Qualidade'], ['Como correu', 'Aceitou'], ['O que faria diferente', 'Falar mais cedo'], ['Feedback recebido', 'Bom tom']]) await expect(page.getByLabel(l, { exact: true })).toHaveValue(v);
  await expect(page.getByRole('radio', { name: 'Role-play' })).toHaveAttribute('aria-checked', 'true');
});

test('R4 weekly review: from Sunday 18:00, automatic summary and the 3 questions', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-04T17:00'));
  await signUp(page);
  await startDay(page);
  await goTab(page, 'Revisão');
  await page.getByRole('radio', { name: 'Semanas' }).click();
  await expect(page.getByRole('button', { name: /Semana de 28 set\./ })).toHaveCount(0);
  await page.clock.setFixedTime(lisbon('2026-10-04T18:05'));
  await page.reload();
  await page.getByRole('radio', { name: 'Semanas' }).click();
  await page.getByRole('button', { name: /Semana de 28 set\./ }).click();
  await expect(page.getByTestId('week-summary')).toContainText('Melhor dia');
  await page.getByLabel('Que decisões tomei mais depressa do que devia?').fill('Aceitar a reunião');
  await page.getByLabel('Em que decisões gastei tempo a mais?').fill('Escolher o portátil');
  await page.getByLabel('O que vou mudar a partir de segunda-feira?').fill('Blocos de foco');
  await page.getByLabel('O que vou mudar a partir de segunda-feira?').blur();
  await page.goBack();
  await expect(page.getByText('3 de 3 respostas')).toBeVisible();
});

test('R6 week report PDF in PT and EN', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await createTask(page, { title: 'Ação', duration: 30 });
  await goTab(page, 'Revisão');
  await page.getByRole('radio', { name: 'Relatórios' }).click();
  await page.getByRole('radiogroup', { name: 'Tipo de relatório' }).getByRole('radio', { name: 'Semana' }).click();
  await expect(page.getByTestId('report-preview')).toContainText('Relatório semanal');
  const pt = await getPdf(page, () => page.getByRole('button', { name: 'Descarregar PDF' }).click());
  expect(pt.subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.getByTestId('report-preview')).toContainText('Weekly report');
  const en = await getPdf(page, () => page.getByRole('button', { name: 'Download PDF' }).click());
  expect(en.subarray(0, 5).toString()).toBe('%PDF-');
  expect(en.length).toBeGreaterThan(5000);
});

test('R7 training report: 9 sections, justification, group feedback in 5 and 8, Completa/Incompleta, PDF', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await openCreate(page, 'Decisão');
  await page.getByRole('dialog').getByLabel('Decisão').fill('Escolher curso');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await goTab(page, 'Revisão');
  await page.getByRole('radio', { name: 'Relatórios' }).click();
  await page.getByRole('radio', { name: 'Formação' }).click();
  await expect(page).toHaveURL(/#\/formacao/);
  for (const k of ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 'close']) await expect(page.getByTestId(`training-${k}`)).toBeVisible();
  await expect(page.getByTestId('training-t5').getByLabel('Feedback do grupo')).toBeVisible();
  await expect(page.getByTestId('training-t8').getByLabel('Feedback do grupo')).toBeVisible();
  await expect(page.getByTestId('training-t6').getByLabel('Feedback do grupo')).toHaveCount(0);
  // t6 uses the 10 most recent decisions by default: complete once justified
  const t6 = page.getByTestId('training-t6');
  await expect(t6.getByTestId('status')).toHaveText('Incompleta');
  await expect(t6).toContainText('Escolher curso');
  await t6.getByLabel('A minha justificação').fill('Usei o mapa para decidir.');
  await t6.getByLabel('A minha justificação').blur();
  await expect(t6.getByTestId('status')).toHaveText('Completa');
  const t1 = page.getByTestId('training-t1');
  await t1.getByLabel('Semana de').fill('2026-09-30');
  await expect(t1).toContainText('28 set. – 4 out.');
  await expect(t1.getByTestId('status')).toHaveText('Incompleta');
  await page.reload();
  await expect(page.getByTestId('training-t6').getByTestId('status')).toHaveText('Completa');
  await expect(page.getByText('1 de 9 secções completas')).toBeVisible();
  const pdf = await getPdf(page, () => page.getByRole('button', { name: 'Descarregar PDF' }).click());
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
});
