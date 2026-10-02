import { db, table } from './db';
import type { Base, TableMap, TableName } from './types';

type Data<K extends TableName> = Omit<TableMap[K], keyof Base> & Partial<Pick<Base, 'id'>>;

let currentUser: string | null = null;
const listeners = new Set<() => void>();

export function setRepoUser(id: string | null): void {
  currentUser = id;
}
export function getRepoUser(): string | null {
  return currentUser;
}

/** Called after every local change (the sync engine subscribes to schedule a push). */
export function onLocalChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** Strictly increasing ISO timestamp so two writes in the same millisecond keep their order. */
let lastStamp = 0;
export function stamp(): string {
  let t = Date.now();
  if (t <= lastStamp) t = lastStamp + 1;
  lastStamp = t;
  return new Date(t).toISOString();
}

async function markDirty(name: TableName, id: string): Promise<void> {
  await db.outbox.put({ key: `${name}:${id}`, table: name, id, at: Date.now() });
}

function notify(): void {
  listeners.forEach((fn) => fn());
}

export async function create<K extends TableName>(name: K, data: Data<K>): Promise<TableMap[K]> {
  const now = stamp();
  const rec = {
    ...data,
    id: data.id ?? uuid(),
    user_id: currentUser,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  } as unknown as TableMap[K];
  await db.transaction('rw', table(name), db.outbox, async () => {
    await table(name).put(rec);
    await markDirty(name, rec.id);
  });
  notify();
  return rec;
}

export async function update<K extends TableName>(name: K, id: string, patch: Partial<TableMap[K]>): Promise<TableMap[K] | undefined> {
  let out: TableMap[K] | undefined;
  await db.transaction('rw', table(name), db.outbox, async () => {
    const cur = await table(name).get(id);
    if (!cur) return;
    out = { ...cur, ...patch, id, updated_at: stamp() } as TableMap[K];
    await table(name).put(out);
    await markDirty(name, id);
  });
  notify();
  return out;
}

/** Writes a whole record (used to restore a previous version for "Desfazer"). */
export async function put<K extends TableName>(name: K, rec: TableMap[K]): Promise<void> {
  const next = { ...rec, updated_at: stamp() };
  await db.transaction('rw', table(name), db.outbox, async () => {
    await table(name).put(next);
    await markDirty(name, rec.id);
  });
  notify();
}

/** Soft delete. Returns a function that undoes it. */
export async function remove<K extends TableName>(name: K, id: string): Promise<() => Promise<void>> {
  await update(name, id, { deleted_at: stamp() } as Partial<TableMap[K]>);
  return async () => {
    await update(name, id, { deleted_at: null } as Partial<TableMap[K]>);
  };
}

export async function get<K extends TableName>(name: K, id: string): Promise<TableMap[K] | undefined> {
  const r = await table(name).get(id);
  return r && !r.deleted_at ? r : undefined;
}

export async function all<K extends TableName>(name: K): Promise<TableMap[K][]> {
  return (await table(name).toArray()).filter((r) => !r.deleted_at);
}

/** Snapshot a set of records so a multi-record action can be undone in one go. */
export async function snapshot<K extends TableName>(name: K, ids: string[]): Promise<() => Promise<void>> {
  const before = (await table(name).bulkGet(ids)).filter(Boolean) as TableMap[K][];
  return async () => {
    for (const r of before) await put(name, r);
  };
}
