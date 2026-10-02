import { test as base, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export { expect };

/** Fails the test on any console error or page error. */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      page.on('pageerror', (e) => errors.push(e.message));
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024;

let counter = 0;
/** Creates an account in local mode and finishes the first-use steps (skipping the optional ones). */
export async function signUp(page: Page, opts: { lang?: 'pt-PT' | 'en'; keepOnboarding?: boolean } = {}) {
  await page.goto('./');
  if (opts.lang === 'en') await page.getByRole('button', { name: 'EN', exact: true }).click();
  await page.getByRole('button', { name: opts.lang === 'en' ? 'Create account' : 'Criar conta' }).click();
  await page.getByLabel('Email').fill(`m${Date.now()}${counter++}@exemplo.pt`);
  await page.getByLabel(opts.lang === 'en' ? 'Password' : 'Palavra-passe').fill('segredo123');
  await page.getByRole('button', { name: opts.lang === 'en' ? 'Create account' : 'Criar conta' }).click();
  if (opts.keepOnboarding) return;
  await expect(page.getByRole('heading', { name: 'Áreas' })).toBeVisible();
  await expect(page.getByLabel('Nome').first()).toHaveValue('Pessoal');
  await page.getByRole('button', { name: 'Seguinte' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await page.getByRole('button', { name: 'Saltar' }).click();
  await page.getByRole('button', { name: 'Agora não' }).click();
  await expect(page).toHaveURL(/#\/hoje/);
}

export async function goTab(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: /Navegação principal|Main navigation/ }).filter({ visible: true });
  await nav.getByRole('link', { name }).click();
}

export async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
