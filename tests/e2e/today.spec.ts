import { test, expect, signUp, lisbon, createTask, createEvent, startDay, card, axe } from './fixtures';

test('H4 H5 H6 H7 timer: start, pause, resume, complete; survives reload; overtime colour; second activity pauses the first', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T09:00'));
  await signUp(page);
  await startDay(page);
  await createTask(page, { title: 'Escrever relatório', duration: 15 });
  await createTask(page, { title: 'Ler artigo', duration: 30 });
  await card(page, 'Escrever relatório').getByRole('button', { name: 'Iniciar' }).click();
  const now = page.getByTestId('now-card');
  await expect(now).toContainText('Escrever relatório');
  await page.clock.setFixedTime(lisbon('2026-10-02T09:10'));
  await expect(now).toContainText('0:10:00');
  await now.getByRole('button', { name: 'Pausar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-02T09:30'));
  await card(page, 'Escrever relatório').getByRole('button', { name: 'Retomar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-02T09:40'));
  // H4: real time excludes the 20 minute pause → 20 min; H6: 15 planned → +5
  await expect(now).toContainText('0:20:00');
  await expect(now).toHaveAttribute('data-over', 'true');
  await expect(now).toContainText('+5 min');
  // H5: reload keeps the timer from stored instants
  await page.reload();
  await expect(page.getByTestId('now-card')).toContainText('0:20:00');
  // H7: starting another activity pauses the first, with Desfazer
  await card(page, 'Ler artigo').getByRole('button', { name: 'Iniciar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Escrever relatório ficou em pausa' })).toBeVisible();
  await expect(page.getByTestId('now-card')).toContainText('Ler artigo');
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByTestId('now-card')).toContainText('Escrever relatório');
  // complete → energy (skip)
  await page.getByTestId('now-card').getByRole('button', { name: 'Concluir' }).click();
  await expect(page.getByRole('dialog', { name: 'Como está a tua energia agora?' })).toBeVisible();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(card(page, 'Escrever relatório').getByRole('button', { name: /concluída/ })).toBeVisible();
  await axe(page);
});

test('H8 completing without starting asks how long; energy can be chosen', async ({ page }) => {
  await signUp(page);
  await createTask(page, { title: 'Ligar ao banco', duration: 45 });
  await card(page, 'Ligar ao banco').getByRole('button', { name: 'Concluir Ligar ao banco' }).click();
  const d = page.getByRole('dialog', { name: 'Quanto tempo levou?' });
  await expect(d.getByLabel('Minutos')).toHaveValue('45');
  await d.getByLabel('Minutos').fill('20');
  await d.getByRole('button', { name: 'Concluído' }).click();
  await page.getByRole('dialog', { name: 'Como está a tua energia agora?' }).getByRole('button', { name: 'Alta', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await card(page, 'Ligar ao banco').getByText('Ligar ao banco', { exact: true }).click();
  await expect(page).toHaveURL(/#\/tarefa\//);
  await expect(page.getByText('Concluída · real 20 min')).toBeVisible();
  await expect(page.getByText('Energia ao concluir: Alta')).toBeVisible();
});

test('H1 after midnight Hoje stays on the active day and shows the time; H3 20-hour warning uses the right suggestion', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T08:00'));
  await signUp(page);
  await startDay(page);
  await createTask(page, { title: 'Tarefa tardia', duration: 30 });
  await page.clock.setFixedTime(lisbon('2026-10-02T21:00'));
  await card(page, 'Tarefa tardia').getByRole('button', { name: 'Concluir Tarefa tardia' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Concluído' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-03T00:30'));
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sexta-feira, 2 de outubro');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('00:30');
  await expect(page.getByTestId('too-long')).toHaveCount(0);
  await page.clock.setFixedTime(lisbon('2026-10-03T04:30'));
  await page.reload();
  const warn = page.getByTestId('too-long');
  await expect(warn).toContainText('Este dia começou há mais de 20 horas. Já terminaste?');
  await expect(warn.getByRole('button', { name: 'Terminar às 21:00' })).toBeVisible();
  await warn.getByRole('button', { name: 'Ainda não' }).click();
  await expect(page.getByTestId('too-long')).toHaveCount(0);
});

test('H14 Cheguei records arrival; "Como correu" appears at the end of an event without status', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T14:40'));
  await signUp(page);
  await createEvent(page, { title: 'Dentista', date: '2026-10-02', start: '15:00', end: '15:30' });
  await createEvent(page, { title: 'Reunião', date: '2026-10-02', start: '13:00', end: '14:00' });
  await expect(page.getByText('Como correu Reunião?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelado pela outra pessoa' }).click();
  await expect(page.getByText('Como correu Reunião?')).toHaveCount(0);
  await page.clock.setFixedTime(lisbon('2026-10-02T15:08'));
  await card(page, 'Dentista').getByRole('button', { name: 'Cheguei' }).click();
  await expect(card(page, 'Dentista')).toContainText('Atrasada');
  await expect(card(page, 'Dentista')).toContainText('Chegada 15:08');
});

test('H9 progress weights by duration, events weigh 30, cancelled by the other person leaves', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T16:00'));
  await signUp(page);
  await createTask(page, { title: 'Longa', duration: 90 });
  await createTask(page, { title: 'Curta', duration: 30 });
  await createEvent(page, { title: 'Almoço', date: '2026-10-02', start: '12:00', end: '15:00' });
  await createEvent(page, { title: 'Café', date: '2026-10-02', start: '10:00', end: '10:30' });
  await page.getByText('Como correu Almoço?').locator('..').getByRole('button', { name: 'A horas' }).click();
  await page.getByText('Como correu Café?').locator('..').getByRole('button', { name: 'Cancelado pela outra pessoa' }).click();
  await card(page, 'Longa').getByRole('button', { name: 'Concluir Longa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  // (90 + 30) / (90 + 30 + 30) = 80%
  await expect(page.getByRole('img', { name: 'Progresso do dia: 80%' })).toBeVisible();
});
