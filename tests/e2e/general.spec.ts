import { test, expect, signUp, goTab, axe } from './fixtures';

test('G1 tabs and settings open without errors; axe clean', async ({ page }) => {
  await signUp(page);
  await axe(page);
  for (const tab of ['Calendário', 'Tarefas', 'Objetivos', 'Revisão', 'Hoje']) {
    await goTab(page, tab);
    await expect(page.locator('main')).toBeVisible();
    await axe(page);
  }
  await page.getByRole('link', { name: 'Definições' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Definições' })).toBeVisible();
  await axe(page);
});
