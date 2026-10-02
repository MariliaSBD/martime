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

/** Lisbon wall-clock time → Date (summer time in October 2026 is UTC+1, from 25 October UTC+0). */
export function lisbon(iso: string): Date {
  const d = new Date(`${iso}:00Z`);
  const summer = d < new Date('2026-10-25T01:00:00Z') && d > new Date('2026-03-29T01:00:00Z');
  return new Date(d.getTime() - (summer ? 3600000 : 0));
}

export async function openCreate(page: Page, kind: string) {
  await page.getByRole('button', { name: /^(Criar|Create)$/ }).last().click();
  await page.getByRole('dialog').getByRole('button', { name: kind, exact: true }).click();
}

export async function createTask(page: Page, o: { title: string; date?: string; start?: string; end?: string; duration?: number }) {
  await openCreate(page, 'Tarefa');
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill(o.title);
  if (o.date !== undefined) await d.getByLabel('Data', { exact: true }).fill(o.date);
  if (o.start) await d.getByLabel('Início previsto').fill(o.start);
  if (o.end) await d.getByLabel('Fim previsto').fill(o.end);
  if (o.duration) await d.getByRole('radio', { name: String(o.duration), exact: true }).click();
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function createEvent(page: Page, o: { title: string; date: string; start: string; end: string }) {
  await openCreate(page, 'Compromisso');
  const d = page.getByRole('dialog');
  await d.getByLabel('Título').fill(o.title);
  await d.getByLabel('Data', { exact: true }).fill(o.date);
  await d.getByLabel('Início', { exact: true }).fill(o.start);
  await d.getByLabel('Fim', { exact: true }).fill(o.end);
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

export async function startDay(page: Page) {
  await page.getByRole('button', { name: 'Começar o dia' }).first().click();
  await expect(page.getByRole('button', { name: 'Terminar o dia' })).toBeVisible();
}

export function card(page: Page, title: string) {
  return page.locator('main li').filter({ has: page.getByText(title, { exact: true }) }).last();
}
