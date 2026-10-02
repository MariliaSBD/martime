import { test, expect, signUp, lisbon, openCreate, goTab, axe } from './fixtures';
import type { Page } from '@playwright/test';

async function createGoal(page: Page, o: { what: string; type: 'Número' | 'Concluir algo' | 'Frequência'; source?: string; target?: string; start?: string; due?: string; parent?: string; routine?: string }) {
  await openCreate(page, 'Objetivo');
  const d = page.getByRole('dialog');
  await d.getByLabel('O quê, exatamente?').fill(o.what);
  await d.getByLabel('Como vou medir?').fill('Contagem');
  if (o.start) await d.getByLabel('Data de início').fill(o.start);
  if (o.due) await d.getByLabel('Até quando?').fill(o.due);
  if (o.parent) await d.getByLabel('Objetivo maior (opcional)').selectOption({ label: o.parent });
  await d.getByRole('radio', { name: o.type }).click();
  if (o.source) await d.getByLabel('Fonte do progresso').selectOption({ label: o.source });
  if (o.target) await d.getByLabel('Meta').fill(o.target);
  if (o.routine) await d.getByLabel('Nome da rotina').fill(o.routine);
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL(/#\/objetivo\//);
}

async function addStepAndComplete(page: Page, title: string) {
  await page.getByRole('button', { name: 'Passo', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Título').fill(title);
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('button', { name: `Concluir ${title}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
}

test('O1 O2 O4 number goal from linked tasks; expected pace phrase; Caminho', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-11T10:00'));
  await signUp(page);
  await createGoal(page, { what: 'Ler 10 artigos', type: 'Número', source: 'Tarefas ligadas concluídas', target: '10', start: '2026-10-01', due: '2026-10-21' });
  // expected at day 10 of 20 = 5 → 0 done = 5 below pace
  await expect(page.getByTestId('pace')).toHaveText('5 abaixo do ritmo');
  for (const n of ['A1', 'A2', 'A3', 'A4', 'A5']) await addStepAndComplete(page, n);
  await expect(page.getByTestId('pace')).toHaveText('No ritmo');
  await expect(page.getByRole('img', { name: 'Progresso: 50%' })).toBeVisible();
  await addStepAndComplete(page, 'A6');
  await expect(page.getByTestId('pace')).toHaveText('1 acima do ritmo');
  await expect(page.getByTestId('path').locator('li')).toHaveCount(6);
  await expect(page.getByTestId('path')).toContainText('11 out.');
  await expect(page.getByTestId('path-summary')).toContainText('aos domingos');
  await axe(page);
});

test('O1 manual only when chosen; frequency from a routine', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-05T10:00'));
  await signUp(page);
  await createGoal(page, { what: 'Poupar', type: 'Número', source: 'Manual', target: '100' });
  await expect(page.getByRole('heading', { name: 'Registar valor' })).toBeVisible();
  await page.getByPlaceholder('Valor atual').fill('25');
  await page.getByRole('button', { name: 'Adicionar' }).first().click();
  await expect(page.getByRole('img', { name: 'Progresso: 25%' })).toBeVisible();
  await goTab(page, 'Objetivos');
  await createGoal(page, { what: 'Caminhar 3x por semana', type: 'Frequência', routine: 'Caminhada', start: '2026-10-05', due: '2026-10-18' });
  await expect(page.getByText('0 / 6')).toBeVisible();
  await page.goto('./#/hoje');
  await page.getByRole('button', { name: 'Concluir Caminhada', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await goTab(page, 'Objetivos');
  await expect(page.getByText('1 / 6')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Registar valor' })).toHaveCount(0);
});

test('O3 smaller goals count as steps of a "Concluir algo" parent; O5 reviews, single main goal, abandon requires reflection', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-05T10:00'));
  await signUp(page);
  await createGoal(page, { what: 'Lançar blogue', type: 'Concluir algo', start: '2026-10-01', due: '2026-10-31' });
  await expect(page.getByText('16 de outubro de 2026')).toBeVisible(); // default review half-way
  await expect(page.getByText('31 de outubro de 2026')).toBeVisible();
  await page.getByRole('switch', { name: 'Objetivo principal' }).click();
  await page.getByLabel('Porque merece mais esforço').fill('Visibilidade');
  await page.getByRole('button', { name: 'Objetivo pequeno' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('O quê, exatamente?').fill('Escolher nome');
  await expect(d.getByLabel('Objetivo maior (opcional)')).toHaveValue(/.+/);
  await d.getByRole('radio', { name: 'Concluir algo' }).click();
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('switch', { name: 'Concluído' }).click();
  await page.getByRole('radio', { name: 'Concluído' }).click();
  await page.getByRole('switch', { name: 'Objetivo principal' }).click(); // the child becomes main
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('switch', { name: 'Objetivo principal' })).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Objetivo pequeno' }).click();
  await page.getByRole('dialog').getByLabel('O quê, exatamente?').fill('Primeiro artigo');
  await page.getByRole('dialog').getByRole('radio', { name: 'Concluir algo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('img', { name: 'Progresso: 50%' })).toBeVisible();
  // abandon requires "O que aprendi?"
  await page.getByRole('radio', { name: 'Abandonado' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Obrigatório');
  await page.getByRole('dialog').getByLabel('O que aprendi?').fill('Começar mais pequeno');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Começar mais pequeno')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Abandonado' })).toHaveAttribute('aria-checked', 'true');
});
