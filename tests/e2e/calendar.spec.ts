import { test, expect, signUp, lisbon, createTask, goTab, openCreate, startDay, isMobile, axe } from './fixtures';

test('C1 the four views go back and forth and "Hoje" returns to today', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await goTab(page, 'Calendário');
  const title = page.getByTestId('cal-title');
  await expect(title).toHaveText('Outubro 2026');
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(title).toHaveText('Novembro 2026');
  await page.getByRole('button', { name: 'Anterior' }).click();
  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(title).toHaveText('Setembro 2026');
  await page.getByRole('radio', { name: 'Ano' }).click();
  await expect(title).toHaveText('2026');
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(title).toHaveText('2027');
  await page.getByRole('radio', { name: 'Semana' }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(title).toHaveText('28 set. – 4 out.');
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(title).toHaveText('5 out. – 11 out.');
  await page.getByRole('radio', { name: 'Dia' }).click();
  await page.getByRole('button', { name: 'Hoje', exact: true }).click();
  await expect(title).toHaveText('2 de outubro de 2026');
  await page.getByRole('button', { name: 'Anterior' }).click();
  await expect(title).toHaveText('1 de outubro de 2026');
  await axe(page);
});

test('C2 year view colours: progress scale, beige without items, white future, holidays outlined', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await createTask(page, { title: 'Hoje feita', duration: 30 });
  await page.getByRole('button', { name: 'Concluir Hoje feita' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Não registar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await createTask(page, { title: 'Ontem', date: '2026-10-01', duration: 30 });
  await goTab(page, 'Calendário');
  await page.getByRole('radio', { name: 'Ano' }).click();
  await expect(page.locator('[data-date="2026-10-02"]')).toHaveAttribute('data-color', '#8CE99A');
  await expect(page.locator('[data-date="2026-10-01"]')).toHaveAttribute('data-color', '#FFA8A8');
  await expect(page.locator('[data-date="2026-09-30"]')).toHaveAttribute('data-color', '#F3EBDD');
  await expect(page.locator('[data-date="2026-10-03"]')).toHaveAttribute('data-color', '#FFFFFF');
  await expect(page.locator('[data-date="2026-10-05"]')).toHaveAttribute('aria-label', /Implantação da República \(Nacional\)/);
  await page.locator('[data-date="2026-10-02"]').click();
  await expect(page.getByRole('img', { name: 'Progresso do dia: 100%' })).toBeVisible();
});

test('C5 national and Lisbon holidays in 2026 and 2027 with their labels', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await goTab(page, 'Calendário');
  await page.getByRole('radio', { name: 'Ano' }).click();
  await expect(page.locator('[data-date="2026-04-03"]')).toHaveAttribute('aria-label', /Sexta-feira Santa \(Nacional\)/);
  await expect(page.locator('[data-date="2026-06-04"]')).toHaveAttribute('aria-label', /Corpo de Deus \(Nacional\)/);
  await expect(page.locator('[data-date="2026-06-13"]')).toHaveAttribute('aria-label', /Santo António \(Lisboa\)/);
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await expect(page.locator('[data-date="2027-03-26"]')).toHaveAttribute('aria-label', /Sexta-feira Santa \(Nacional\)/);
  await expect(page.locator('[data-date="2027-05-27"]')).toHaveAttribute('aria-label', /Corpo de Deus \(Nacional\)/);
  await page.getByRole('radio', { name: 'Mês' }).click();
  await page.goto('./#/calendario?v=month&d=2027-06-01');
  await expect(page.getByRole('button', { name: /13 de junho.*Santo António/ })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Santo António' })).toContainText('Lisboa');
  await expect(page.getByRole('listitem').filter({ hasText: 'Dia de Portugal' })).toContainText('Nacional');
});

test('C3 week: drag changes day and time (with Desfazer); tapping empty space creates at that hour', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T08:00'));
  await signUp(page);
  await createTask(page, { title: 'Bloco', date: '2026-10-01', start: '09:00', end: '10:00' });
  await goTab(page, 'Calendário');
  await page.getByRole('radio', { name: 'Semana' }).click();
  const block = page.getByRole('button', { name: 'Bloco, 09:00–10:00' });
  await block.scrollIntoViewIfNeeded();
  if (!isMobile(page)) {
    const b = (await block.boundingBox())!;
    const target = (await page.getByTestId('col-2026-10-02').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + 5);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 10, b.y + 15, { steps: 4 });
    await page.mouse.move(target.x + target.width / 2, b.y + 5 + 48, { steps: 12 });
    await page.mouse.up();
    await expect(page.getByRole('button', { name: 'Bloco, 10:00–11:00' })).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await expect(page.getByRole('button', { name: 'Bloco, 09:00–10:00' })).toBeVisible();
  }
  // tap an empty space at 14:00 on Friday
  const col = page.getByTestId('col-2026-10-02');
  await col.click({ position: { x: 10, y: 14 * 48 + 10 } });
  await page.getByRole('dialog').getByRole('button', { name: 'Tarefa', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel('Início previsto')).toHaveValue('14:00');
  await expect(page.getByRole('dialog').getByLabel('Data', { exact: true })).toHaveValue('2026-10-02');
});

test('C4 H12 day view: Plano and Real side by side, gaps "Sem registo" can be filled', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T08:00'));
  await signUp(page);
  await startDay(page);
  await createTask(page, { title: 'Plano A', start: '09:00', end: '09:30' });
  await page.getByRole('button', { name: 'O que estou a fazer?' }).first().click();
  await page.getByRole('dialog').getByLabel('Atividade').fill('Pequeno-almoço');
  await page.getByRole('dialog').getByRole('button', { name: 'Começar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-02T08:30'));
  await page.getByTestId('now-card').getByRole('button', { name: 'Parar' }).click();
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await page.goto('./#/calendario?v=day&d=2026-10-02');
  await expect(page.getByRole('group', { name: 'Plano' })).toContainText('Plano A');
  await expect(page.getByRole('group', { name: 'Real' }).getByTestId('real-entry')).toContainText('Pequeno-almoço');
  const gap = page.getByTestId('gap');
  await expect(gap).toHaveCount(1);
  await gap.click();
  await page.getByRole('dialog').getByLabel('Atividade').fill('Emails');
  await page.getByRole('dialog').getByRole('button', { name: 'Criar' }).click();
  await expect(page.getByTestId('gap')).toHaveCount(0);
  await expect(page.getByTestId('real-entry')).toHaveCount(2);
});

test('C6 important dates repeat every year and create the "O que fazer" tasks on the right days', async ({ page }) => {
  await page.clock.setFixedTime(lisbon('2026-10-02T10:00'));
  await signUp(page);
  await openCreate(page, 'Data importante');
  const d = page.getByRole('dialog');
  await d.getByLabel('Nome').fill('Aniversário da Inês');
  await d.getByLabel('Data').fill('2026-10-20');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page).toHaveURL(/#\/data\//);
  await page.getByPlaceholder('Ex.: Comprar presente').fill('Comprar presente');
  await page.getByLabel('Dias antes', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Adicionar' }).last().click();
  await expect(page.getByText('Na véspera')).toBeVisible();
  await expect(page.getByText('7 dias antes')).toBeVisible();
  await page.goto('./#/calendario?v=month&d=2026-10-01');
  await expect(page.getByRole('button', { name: /20 de outubro.*Aniversário da Inês/ })).toBeVisible();
  await page.goto('./#/calendario?v=day&d=2026-10-17');
  await expect(page.getByRole('button', { name: 'Comprar presente' })).toBeVisible();
  await page.goto('./#/calendario?v=month&d=2027-10-01');
  await expect(page.getByRole('button', { name: /20 de outubro.*Aniversário da Inês/ })).toBeVisible();
});
