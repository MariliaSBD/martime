import { beforeEach, describe, expect, it } from 'vitest';
import { db, resetDb } from './db';
import { create, get, remove, setRepoUser, update } from './repo';
import { fromRow, pullAll, pushOutbox, syncOnce, toRow, type Remote, type RemoteRow } from './sync';
import type { Area, Task } from './types';

/** In-memory server with the same rules as the Postgres trigger: last updated_at wins; server_updated_at always moves. */
class FakeServer implements Remote {
  tables = new Map<string, Map<string, RemoteRow>>();
  clock = 0;
  pulls: { table: string; since: string | null }[] = [];
  t(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new Map());
    return this.tables.get(name)!;
  }
  async push(name: string, rows: RemoteRow[]) {
    for (const r of rows) {
      const cur = this.t(name).get(r.id);
      if (cur && cur.updated_at > r.updated_at) continue;
      this.t(name).set(r.id, { ...r, server_updated_at: `S${String(++this.clock).padStart(6, '0')}` });
    }
  }
  async pull(name: string, since: string | null) {
    this.pulls.push({ table: name, since });
    return [...this.t(name).values()].filter((r) => !since || r.server_updated_at! > since).sort((a, b) => (a.server_updated_at! < b.server_updated_at! ? -1 : 1));
  }
}

const area = { name: 'Pessoal', color: 7, order: 0 };

beforeEach(async () => {
  await resetDb();
  setRepoUser('u1');
});

describe('sync (4.3)', () => {
  it('pushes local changes and empties the outbox', async () => {
    const server = new FakeServer();
    const a = await create('areas', area);
    expect(await db.outbox.count()).toBe(1);
    await pushOutbox(server, 'u1');
    expect(await db.outbox.count()).toBe(0);
    const row = server.t('areas').get(a.id)!;
    expect(row.user_id).toBe('u1');
    expect(row.data).toMatchObject({ name: 'Pessoal', color: 7 });
  });

  it('a change made on another device appears locally', async () => {
    const server = new FakeServer();
    const a = await create('areas', area);
    await syncOnce(server, 'u1');
    const remoteCopy = fromRow('areas', server.t('areas').get(a.id)!);
    await server.push('areas', [toRow('areas', { ...remoteCopy, name: 'Eu', updated_at: new Date(Date.now() + 1000).toISOString() } as Area, 'u1')]);
    await pullAll(server);
    expect((await get('areas', a.id))?.name).toBe('Eu');
  });

  it('deleting propagates to the other device', async () => {
    const server = new FakeServer();
    const a = await create('areas', area);
    await syncOnce(server, 'u1');
    await remove('areas', a.id);
    await syncOnce(server, 'u1');
    expect(server.t('areas').get(a.id)!.deleted_at).not.toBeNull();
  });

  it('conflict: the most recent updated_at wins, record by record', async () => {
    const server = new FakeServer();
    const a = await create('areas', area);
    await syncOnce(server, 'u1');
    // Other device edits with an OLDER timestamp after our local edit
    await update('areas', a.id, { name: 'Local mais recente' });
    const older = { ...fromRow<'areas'>('areas', server.t('areas').get(a.id)!), name: 'Remoto antigo', updated_at: '2000-01-01T00:00:00.000Z' };
    await server.push('areas', [toRow('areas', older as Area, 'u1')]); // rejected by server: older
    await syncOnce(server, 'u1');
    expect((await get('areas', a.id))?.name).toBe('Local mais recente');
    expect(server.t('areas').get(a.id)!.data.name).toBe('Local mais recente');

    // A newer remote version wins over the local one
    const newer = { ...older, name: 'Remoto novo', updated_at: new Date(Date.now() + 60000).toISOString() };
    await server.push('areas', [toRow('areas', newer as Area, 'u1')]);
    await syncOnce(server, 'u1');
    expect((await get('areas', a.id))?.name).toBe('Remoto novo');
  });

  it('pulls only records changed after the last sync', async () => {
    const server = new FakeServer();
    await create('areas', area);
    await syncOnce(server, 'u1');
    server.pulls = [];
    await pullAll(server);
    expect(server.pulls.find((p) => p.table === 'areas')!.since).toBe('S000001');
  });

  it('keeps typed columns for server-read tables', () => {
    const rec = { id: 'n', user_id: 'u1', created_at: 'a', updated_at: 'a', deleted_at: null, type: 'test', send_at: 'x', title: 'MarTime', body: 'b', url: '#/hoje', status: 'pending', key: 'k', deferrable: false };
    const row = toRow('notifications', rec as never, 'u1');
    expect(row.send_at).toBe('x');
    expect(row.data).toEqual({});
    expect(fromRow('notifications', row)).toMatchObject({ send_at: 'x', status: 'pending' });
  });

  it('task records round-trip through a row', async () => {
    const t = { title: 'Ler', kind: 'task' } as unknown as Task;
    const row = toRow('tasks', { ...t, id: 'x', user_id: 'u1', created_at: 'a', updated_at: 'a', deleted_at: null } as Task, 'u1');
    expect(fromRow('tasks', row).title).toBe('Ler');
  });
});
