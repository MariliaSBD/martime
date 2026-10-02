import { mkdirSync, writeFileSync } from 'node:fs';
import { admin, secretKey, STATE } from './admin';

export default async function setup() {
  process.env.MT_SECRET = secretKey();
  const email = `martime-teste-${Date.now()}@example.com`;
  const password = `T${Math.random().toString(36).slice(2)}9!`;
  const r = await admin('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email, password, email_confirm: true }) });
  const j = (await r.json()) as { id?: string; msg?: string };
  if (!j.id) throw new Error(`could not create the test user: ${JSON.stringify(j)}`);
  mkdirSync('test-results', { recursive: true });
  writeFileSync(STATE, JSON.stringify({ id: j.id, email, password }));
}
