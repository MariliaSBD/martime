import { test, expect } from '@playwright/test';
import { publicKey, testUser, URL } from './admin';

// D5 with the real project: registrations closed must never block an existing account from signing in.
test.describe('closed registrations (D5)', () => {
  test('the project refuses new accounts but keeps email sign-in on', async ({ request }) => {
    const key = publicKey();
    const settings = await (await request.get(`${URL}/auth/v1/settings`, { headers: { apikey: key } })).json();
    expect(settings.disable_signup).toBe(true);
    expect(settings.external.email).toBe(true);
    const r = await request.post(`${URL}/auth/v1/signup`, { headers: { apikey: key }, data: { email: `fechado-${Date.now()}@example.invalid`, password: 'abcdefgh123' } });
    expect(r.status()).toBe(422);
    expect((await r.json()).error_code).toBe('signup_disabled');
  });

  test('an existing account signs in and stays signed in', async ({ page }) => {
    const u = testUser();
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'Entrar' }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Criar conta' })).toHaveCount(0);
    await page.getByLabel('Email').fill(u.email);
    await page.getByLabel('Palavra-passe').fill(u.password);
    await page.getByRole('button', { name: 'Entrar' }).first().click();
    const signedIn = page.getByRole('button', { name: 'Seguinte' }).or(page.getByRole('button', { name: 'Criar', exact: true }).last());
    await expect(signedIn).toBeVisible({ timeout: 30000 });
    await page.reload();
    await expect(signedIn).toBeVisible({ timeout: 30000 });
    await expect(page.getByLabel('Palavra-passe')).toHaveCount(0);
  });
});
