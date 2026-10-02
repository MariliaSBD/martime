import { test, expect, signUp, lisbon, createTask, createEvent, openCreate, startDay, axe, goTab } from './fixtures';

test('accessibility: every screen and the main dialogs have no serious or critical axe violations', async ({ page }) => {
  test.setTimeout(240_000);
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await startDay(page);
  await createTask(page, { title: 'Relatório', start: '11:00', end: '12:00' });
  await createEvent(page, { title: 'Reunião', date: '2026-10-02', start: '14:00', end: '15:00' });
  await page.getByRole('button', { name: 'Iniciar' }).first().click();
  await axe(page);
  // create dialogs
  for (const kind of ['Tarefa', 'Compromisso', 'Objetivo', 'Projeto', 'Decisão', 'Reflexão', 'Data importante']) {
    await openCreate(page, kind);
    await expect(page.getByRole('dialog')).toBeVisible();
    await axe(page);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
  }
  await openCreate(page, 'Objetivo');
  await page.getByRole('dialog').getByLabel('O quê, exatamente?').fill('Ler 5 livros');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await axe(page);
  await goTab(page, 'Tarefas');
  await openCreate(page, 'Projeto');
  await page.getByRole('dialog').getByLabel('Nome').fill('Projeto');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar', exact: true }).click();
  await axe(page);
  const routes = ['#/hoje', '#/hoje/revisao', '#/hoje/reorganizar', '#/tarefas', '#/calendario?v=year', '#/calendario?v=month', '#/calendario?v=week', '#/calendario?v=day', '#/objetivos', '#/revisao?t=stats', '#/revisao?t=diary', '#/revisao?t=weeks', '#/revisao?t=reports', '#/formacao', '#/definicoes'];
  for (const r of routes) {
    await page.goto(`./${r}`);
    await page.waitForTimeout(300);
    await axe(page);
  }
  await page.goto('./#/tarefas');
  await page.getByRole('radio', { name: 'Matriz' }).click();
  await axe(page);
  await page.getByText('Relatório', { exact: true }).first().click();
  await expect(page).toHaveURL(/#\/tarefa\//);
  await axe(page);
});
