import { existsSync, rmSync } from 'node:fs';
import { admin, STATE, testUser } from './admin';

/** Deleting the user removes all of its rows (every table cascades on auth.users). */
export default async function teardown() {
  if (!existsSync(STATE)) return;
  const u = testUser();
  await admin(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
  const left = await admin(`/rest/v1/tasks?user_id=eq.${u.id}&select=id`);
  const rows = (await left.json()) as unknown[];
  if (rows.length) throw new Error('test data left behind');
  rmSync(STATE);
}
