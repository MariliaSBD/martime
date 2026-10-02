import { test, expect, signUp, lisbon, createTask, card, openCreate, startDay, goTab, axe, isMobile } from './fixtures';
import type { Page } from '@playwright/test';

async function classify(page: Page, title: string, urgent: string, important: string) {
  await openCreate(page, 'Tarefa');
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill(title);
  await d.getByRole('button', { name: 'Mais opções' }).click();
  if (urgent) await d.getByRole('radiogroup', { name: 'Urgente' }).getByRole('radio', { name: urgent }).click();
  if (important) await d.getByRole('radiogroup', { name: 'Importante' }).getByRole('radio', { name: important }).click();
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('T2 T3 matrix quadrants, "Por classificar", moving and hard to classify', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await classify(page, 'Incêndio', 'Sim', 'Sim');
  await classify(page, 'Plano anual', 'Não', 'Sim');
  await classify(page, 'Pedido do vizinho', 'Sim', 'Não');
  await classify(page, 'Ver vídeos', 'Não', 'Não');
  await classify(page, 'Talvez', '', '');
  await goTab(page, 'Tarefas');
  await page.getByRole('radio', { name: 'Matriz' }).click();
  await expect(page.getByTestId('zone-do')).toContainText('Incêndio');
  await expect(page.getByTestId('zone-schedule')).toContainText('Plano anual');
  await expect(page.getByTestId('zone-delegate')).toContainText('Pedido do vizinho');
  await expect(page.getByTestId('zone-eliminate')).toContainText('Ver vídeos');
  await expect(page.getByTestId('zone-unclassified')).toContainText('Talvez');
  await expect(page.getByText('5 tarefas')).toBeVisible();
  // Mover para… changes urgent / important
  await page.getByTestId('zone-unclassified').getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Mover para Agendar' }).click();
  await expect(page.getByTestId('zone-schedule')).toContainText('Talvez');
  // drag "Ver vídeos" into "Fazer já" (on iPhone, "Mover para…" is the way)
  if (isMobile(page)) {
    await page.getByTestId('zone-eliminate').getByRole('button', { name: 'Mais opções' }).click();
    await page.getByRole('menuitem', { name: 'Mover para Fazer já' }).click();
  } else {
  const handle = page.getByRole('button', { name: 'Mover Ver vídeos' });
  const target = page.getByTestId('zone-do');
  const hb = (await handle.boundingBox())!;
  const tb = (await target.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 20, hb.y + 20, { steps: 5 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 40, { steps: 15 });
  await page.mouse.up();
  }
  await expect(page.getByTestId('zone-do')).toContainText('Ver vídeos');
  // T3
  await page.getByTestId('zone-schedule').locator('li').filter({ hasText: 'Plano anual' }).getByRole('button', { name: 'Mais opções' }).click();
  await page.getByRole('menuitem', { name: 'Marcar como difícil de classificar' }).click();
  await page.getByRole('dialog').getByLabel('Porque foi difícil?').fill('Depende do chefe');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByTestId('zone-schedule').locator('li').filter({ hasText: 'Plano anual' })).toContainText('Difícil de classificar');
  await axe(page);
});

test('T4 projects: critical steps, timeline, late alert, resources, obstacles, diary, delete options', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-05T10:00'));
  await signUp(page);
  await openCreate(page, 'Projeto');
  const d = page.getByRole('dialog');
  await d.getByLabel('Nome').fill('Mini-projeto');
  await d.getByLabel('Data de início').fill('2026-10-01');
  await d.getByLabel('Data de fim').fill('2026-10-09');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL(/#\/projeto\//);
  await page.getByRole('button', { name: 'Etapa', exact: true }).click();
  const s = page.getByRole('dialog');
  await s.getByLabel('Título').fill('Comprar material');
  await s.getByLabel('Data', { exact: true }).fill('2026-10-02');
  await s.getByRole('button', { name: 'Mais opções' }).click();
  await s.getByRole('switch', { name: 'Etapa crítica' }).click();
  await s.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByText('Há uma etapa crítica atrasada')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Linha temporal' })).toContainText('Comprar material');
  await expect(page.getByRole('list', { name: 'Linha temporal' })).toContainText('Crítica');
  await page.getByRole('textbox', { name: 'Recurso' }).last().fill('Cartolina');
  await page.getByRole('textbox', { name: 'Recurso' }).last().press('Enter');
  await page.getByPlaceholder('Ex.: Atraso da mudança').fill('Loja fechada');
  await page.getByPlaceholder('Ex.: Pedir ajuda à família').fill('Comprar online');
  await page.getByPlaceholder('Ex.: Pedir ajuda à família').press('Enter');
  await page.getByPlaceholder('Ex.: Terminei o esboço').fill('Comecei hoje');
  await page.getByPlaceholder('Ex.: Terminei o esboço').blur();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Recurso' }).first()).toHaveValue('Cartolina');
  await expect(page.getByRole('textbox', { name: 'Obstáculo' }).first()).toHaveValue('Loja fechada');
  await expect(page.getByPlaceholder('Ex.: Terminei o esboço')).toHaveValue('Comecei hoje');
  await page.getByRole('button', { name: 'Mais opções' }).first().click();
  await page.getByRole('menuitem', { name: 'Apagar' }).click();
  await page.getByRole('button', { name: 'Manter as etapas como tarefas soltas' }).click();
  await page.getByRole('radio', { name: 'Lista' }).click();
  await page.getByRole('radio', { name: 'Atrasadas' }).click();
  await expect(card(page, 'Comprar material')).toBeVisible();
});

test('H10 Reorganizar appears only when over; decisions update tasks; simulation does not touch tasks', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T21:00'));
  await signUp(page);
  await page.goto('./#/definicoes');
  await page.getByLabel('Hora alvo de dormir').fill('23:00');
  await page.goto('./#/hoje');
  await startDay(page);
  await createTask(page, { title: 'A', duration: 60 });
  await expect(page.getByRole('button', { name: 'Reorganizar o dia' })).toHaveCount(0);
  await createTask(page, { title: 'B', duration: 60 });
  await createTask(page, { title: 'C', duration: 30 });
  await page.getByRole('button', { name: 'Reorganizar o dia' }).click();
  await expect(page.getByTestId('reorg-counter')).toHaveText('2 h 30 min de 2 h');
  await page.getByRole('radiogroup', { name: 'Decisão para B' }).getByRole('radio', { name: 'Adiar' }).click();
  await page.getByRole('radiogroup', { name: 'Decisão para C' }).getByRole('radio', { name: 'Delegar' }).click();
  await page.getByTestId('reorg-item').filter({ hasText: 'C' }).getByLabel('A quem').fill('Rita');
  await page.getByLabel('Critérios que usei').fill('Prazo primeiro');
  await expect(page.getByTestId('reorg-counter')).toHaveText('1 h de 2 h');
  await page.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page).toHaveURL(/#\/hoje$/);
  await expect(card(page, 'C')).toContainText('Delegada');
  await expect(page.locator('main li').filter({ hasText: /^B/ })).toHaveCount(0);
  // delegated C leaves the calculation: A only
  await page.getByRole('button', { name: 'Concluir A', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await expect(page.getByRole('img', { name: 'Progresso do dia: 100%' })).toBeVisible();
  // simulation
  await createTask(page, { title: 'D', duration: 120 });
  await createTask(page, { title: 'E', duration: 15 });
  await page.getByRole('button', { name: 'Reorganizar o dia' }).click();
  await page.getByRole('button', { name: 'Nova simulação' }).click();
  await expect(page.getByLabel('Tempo disponível (min)')).toHaveValue('180');
  await page.getByRole('button', { name: 'Adicionar item' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Chamada do cliente');
  await page.getByRole('combobox', { name: 'Tipo' }).selectOption({ label: 'Chamada' });
  await page.getByLabel('Feedback do grupo').fill('Boa priorização');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Simulação guardada')).toBeVisible();
  await page.goto('./#/hoje');
  await expect(card(page, 'D')).toBeVisible();
  await expect(card(page, 'D')).toContainText('2 h');
});

test('H11 H2 R5 day review: 6 steps, choices applied, frozen progress, sleep between days, tip', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T08:00'));
  await signUp(page);
  await startDay(page);
  await createTask(page, { title: 'Feita', duration: 30 });
  await createTask(page, { title: 'Para amanhã', duration: 30 });
  await createTask(page, { title: 'Para algum dia', duration: 30 });
  await card(page, 'Feita').getByRole('button', { name: 'Concluir Feita' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-02T23:00'));
  await page.getByRole('button', { name: 'Terminar o dia' }).click();
  await expect(page.getByRole('img', { name: 'Progresso do dia: 33%' })).toBeVisible();
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.getByTestId('review-pending')).toHaveCount(2);
  await page.getByRole('radiogroup', { name: 'O que fazer com Para algum dia' }).getByRole('radio', { name: 'Algum dia' }).click();
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await page.getByRole('radio', { name: '4' }).click();
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.getByTestId('tip')).toContainText('Hoje ficou abaixo do previsto. Acontece.');
  await expect(page.getByTestId('tip')).toContainText('Registaste o teu dia.');
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.getByText('Sábado, 3 de outubro', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.getByText('O dia termina às 23:00.')).toBeVisible();
  await page.getByRole('button', { name: 'Terminar o dia' }).click();
  await expect(page.getByRole('button', { name: 'Começar o dia' })).toBeVisible();
  // the next morning: sleep is logged, the frozen progress of yesterday is kept
  await page.clock.setFixedTime(lisbon('2026-10-03T07:30'));
  await page.reload();
  await startDay(page);
  await expect(card(page, 'Para amanhã')).toBeVisible();
  const r = await page.evaluate(async () => {
    const req = indexedDB.open('martime');
    const db: IDBDatabase = await new Promise((res) => (req.onsuccess = () => res(req.result)));
    const get = (s: string) => new Promise<any[]>((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); });
    return { entries: await get('timeEntries'), days: await get('days') };
  });
  const sleep = r.entries.find((e: { source: string }) => e.source === 'sleep');
  expect(sleep.activity).toBe('Sono');
  expect((new Date(sleep.end).getTime() - new Date(sleep.start).getTime()) / 3600000).toBe(8.5);
  const d1 = r.days.find((d: { date: string }) => d.date === '2026-10-02');
  expect(d1.frozen.pct).toBe(33);
  expect(d1.feeling).toBe(4);
});
