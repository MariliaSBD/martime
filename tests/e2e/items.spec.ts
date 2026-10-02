import { test, expect, signUp, lisbon, createTask, card, openCreate, startDay } from './fixtures';

test('T1 validation: title required, end after start, duration computed', async ({ page }) => {
  await signUp(page);
  await openCreate(page, 'Tarefa');
  const d = page.getByRole('dialog');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(d.getByRole('alert')).toContainText('Obrigatório');
  await d.getByLabel('Título').fill('Estudar');
  await d.getByLabel('Início previsto').fill('10:00');
  await d.getByLabel('Fim previsto').fill('09:00');
  await expect(d.getByText('O fim tem de ser depois do início.')).toBeVisible();
  await d.getByLabel('Fim previsto').fill('11:30');
  await expect(d.getByText('Duração prevista: 90 min')).toBeVisible();
  await d.getByRole('button', { name: 'Mais opções' }).click();
  await expect(d.getByRole('radiogroup', { name: 'Urgente' })).toBeVisible();
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(card(page, 'Estudar')).toContainText('10:00–11:30');
});

test('G3 G6 edit, delete and undo; reload keeps data and session', async ({ page }) => {
  await signUp(page);
  await createTask(page, { title: 'Comprar pão' });
  await card(page, 'Comprar pão').getByText('Comprar pão', { exact: true }).click();
  await page.getByLabel('Título').fill('Comprar pão e leite');
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(card(page, 'Comprar pão e leite')).toBeVisible();
  await card(page, 'Comprar pão e leite').getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Apagar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Apagado' })).toBeVisible();
  await expect(page.locator('main li').filter({ hasText: 'Comprar pão e leite' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await expect(card(page, 'Comprar pão e leite')).toBeVisible();
  await page.reload();
  await expect(card(page, 'Comprar pão e leite')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Começar o dia' })).toBeVisible();
});

test('T5 repetition: "Só esta", "Esta e as seguintes", "Todas"', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-05T08:00'));
  await signUp(page);
  await openCreate(page, 'Tarefa');
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill('Alongar');
  await d.getByRole('button', { name: 'Mais opções' }).click();
  await d.getByLabel('Repetição', { exact: true }).selectOption('daily');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(card(page, 'Alongar')).toContainText('Repete');
  // edit only this occurrence
  await card(page, 'Alongar').getByText('Alongar', { exact: true }).click();
  await page.getByLabel('Título').fill('Alongar 10 min');
  await page.getByLabel('Título').blur();
  await page.getByRole('dialog', { name: 'Aplicar a' }).getByRole('button', { name: 'Só esta' }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(card(page, 'Alongar 10 min')).toBeVisible();
  // the next day still has the original title
  await page.clock.setFixedTime(lisbon('2026-10-06T08:00'));
  await page.reload();
  await expect(card(page, 'Alongar')).not.toContainText('10 min');
  // delete this and the following
  await card(page, 'Alongar').getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Apagar' }).click();
  await page.getByRole('dialog', { name: 'Aplicar a' }).getByRole('button', { name: 'Esta e as seguintes' }).click();
  await expect(page.locator('main li').filter({ hasText: 'Alongar' })).toHaveCount(0);
  await page.clock.setFixedTime(lisbon('2026-10-09T08:00'));
  await page.reload();
  await expect(page.getByText('Ainda sem tarefas')).toBeVisible();
});

test('T6 deadline outcome and history of changes', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await createTask(page, { title: 'Entregar trabalho' });
  await card(page, 'Entregar trabalho').getByText('Entregar trabalho', { exact: true }).click();
  await page.getByLabel('Prazo', { exact: true }).fill('2026-10-05');
  await page.getByLabel('Prazo', { exact: true }).fill('2026-10-06');
  await expect(page.getByText(/Prazo alterado de/)).toBeVisible();
  await page.getByRole('button', { name: 'Concluir' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByText('Antes do prazo')).toBeVisible();
});

test('T7 places: travel is pre-filled, creates the travel block and counts apart from waste', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T09:00'));
  await signUp(page);
  await page.goto('./#/definicoes');
  await page.getByRole('button', { name: 'Adicionar local' }).click();
  await page.getByLabel('Nome', { exact: true }).last().fill('Ginásio');
  await page.getByLabel('Deslocação habitual (min)').last().fill('20');
  await page.getByRole('button', { name: 'Criar', exact: true }).click();
  await page.goto('./#/hoje');
  await openCreate(page, 'Tarefa');
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill('Treino');
  await d.getByLabel('Início previsto').fill('10:00');
  await d.getByRole('button', { name: 'Mais opções' }).click();
  await d.getByLabel('Local', { exact: true }).selectOption({ label: 'Ginásio' });
  await expect(d.getByLabel('Deslocação (min)')).toHaveValue('20');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByText('Deslocação · 20 min · sair às 09:40')).toBeVisible();
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await card(page, 'Treino').getByRole('button', { name: 'Iniciar' }).click();
  await page.goto('./#/hoje');
  // the travel entry exists with its own classification
  const travel = await page.evaluate(async () => {
    const req = indexedDB.open('martime');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    const all: { activity: string; classification: string; start: string; end: string }[] = await new Promise((r) => {
      const q = db.transaction('timeEntries').objectStore('timeEntries').getAll();
      q.onsuccess = () => r(q.result);
    });
    return all.filter((e) => e.classification === 'travel');
  });
  expect(travel).toHaveLength(1);
  expect(travel[0].activity).toBe('Deslocação');
  expect((new Date(travel[0].end).getTime() - new Date(travel[0].start).getTime()) / 60000).toBe(20);
});

test('H12 free logging ends the previous activity; timer tasks never duplicate entries', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T09:00'));
  await signUp(page);
  await startDay(page);
  await page.getByRole('button', { name: 'O que estou a fazer?' }).first().click();
  await page.getByRole('dialog').getByLabel('Atividade').fill('Emails');
  await page.getByRole('dialog').getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByTestId('now-card')).toContainText('Emails');
  await page.clock.setFixedTime(lisbon('2026-10-02T09:30'));
  await page.getByTestId('now-card').getByRole('button', { name: 'O que estou a fazer?' }).click();
  await page.getByRole('dialog').getByLabel('Atividade').fill('Redes sociais');
  await page.getByRole('dialog').getByRole('radio', { name: 'Desperdício' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Começar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Emails terminou' })).toBeVisible();
  await expect(page.getByTestId('now-card')).toContainText('Redes sociais');
  const entries = await page.evaluate(async () => {
    const req = indexedDB.open('martime');
    const db: IDBDatabase = await new Promise((r) => (req.onsuccess = () => r(req.result)));
    return new Promise<{ activity: string; end: string | null }[]>((r) => {
      const q = db.transaction('timeEntries').objectStore('timeEntries').getAll();
      q.onsuccess = () => r(q.result);
    });
  });
  expect(entries.find((e) => e.activity === 'Emails')!.end).not.toBeNull();
  expect(entries.filter((e) => e.end === null)).toHaveLength(1);
});

test('H13 48-hour session builds the 30-minute table', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T08:00'));
  await signUp(page);
  await page.getByRole('button', { name: 'Sessão de registo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await page.getByRole('button', { name: 'O que estou a fazer?' }).first().click();
  await page.getByRole('dialog').getByLabel('Atividade').fill('Ler');
  await page.getByRole('dialog').getByRole('button', { name: 'Começar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-02T08:45'));
  await page.getByTestId('now-card').getByRole('button', { name: 'Parar' }).click();
  await page.getByRole('button', { name: 'Ver sessão' }).click();
  await expect(page.getByTestId('slot')).toHaveCount(96);
  await expect(page.getByTestId('slot').nth(0)).toContainText('Ler');
  await expect(page.getByTestId('slot').nth(1)).toContainText('Sem registo'); // 15 of 30 min
  await expect(page.getByTestId('slot').nth(0)).toContainText('08:00');
});
