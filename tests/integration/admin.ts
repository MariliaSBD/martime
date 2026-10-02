import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const REF = 'rhaljsgmmqarhjthiral';
export const URL = `https://${REF}.supabase.co`;
const STATE = 'test-results/integration-user.json';

/** The secret key is read at run time from the Supabase CLI and never stored. */
export function secretKey(): string {
  const out = execSync(`npx supabase projects api-keys --project-ref ${REF} --reveal -o json`, { encoding: 'utf8' });
  const list = JSON.parse(out) as { type?: string; name?: string; api_key: string }[];
  return (list.find((k) => k.type === 'secret') ?? list.find((k) => k.name === 'service_role'))!.api_key;
}

export function publicKey(): string {
  return /VITE_SUPABASE_ANON_KEY=(.*)/.exec(readFileSync('.env.local', 'utf8'))![1].trim();
}

export function testUser(): { id: string; email: string; password: string } {
  return JSON.parse(readFileSync(STATE, 'utf8'));
}

export { STATE };

export async function admin(path: string, init: RequestInit = {}) {
  const key = process.env.MT_SECRET ?? secretKey();
  return fetch(`${URL}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
}
