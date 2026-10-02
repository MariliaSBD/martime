import { db, table } from './db';
import { onLocalChange } from './repo';
import { REMOTE, TABLES, type Base, type TableMap, type TableName } from './types';

export type SyncState = 'synced' | 'syncing' | 'offline' | 'error' | 'local';

export interface RemoteRow {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  server_updated_at?: string;
  data: Record<string, unknown>;
  [typed: string]: unknown;
}

export interface Remote {
  push(remoteTable: string, rows: RemoteRow[]): Promise<void>;
  pull(remoteTable: string, since: string | null): Promise<RemoteRow[]>;
}

/** Columns kept outside `data` because the server reads them. */
const TYPED: Partial<Record<TableName, string[]>> = {
  notifications: ['type', 'send_at', 'title', 'body', 'url', 'status', 'key', 'deferrable', 'released_at'],
  pushSubs: ['endpoint', 'p256dh', 'auth', 'device'],
};
const BASE_KEYS: (keyof Base)[] = ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at'];

export function toRow(name: TableName, rec: Base, userId: string): RemoteRow {
  const data: Record<string, unknown> = {};
  const row: RemoteRow = {
    id: rec.id,
    user_id: userId,
    created_at: rec.created_at,
    updated_at: rec.updated_at,
    deleted_at: rec.deleted_at,
    data,
  };
  const typed = TYPED[name] ?? [];
  for (const [k, v] of Object.entries(rec)) {
    if ((BASE_KEYS as string[]).includes(k)) continue;
    if (typed.includes(k)) row[k] = v;
    else data[k] = v;
  }
  return row;
}

export function fromRow<K extends TableName>(name: K, row: RemoteRow): TableMap[K] {
  const rec: Record<string, unknown> = { ...(row.data ?? {}) };
  for (const k of BASE_KEYS) rec[k] = row[k];
  for (const k of TYPED[name] ?? []) rec[k] = row[k];
  return rec as unknown as TableMap[K];
}

/** Applies remote rows locally: the most recent updated_at wins, record by record. */
export async function mergeRemote<K extends TableName>(name: K, rows: RemoteRow[]): Promise<number> {
  let applied = 0;
  await db.transaction('rw', table(name), async () => {
    for (const row of rows) {
      const local = await table(name).get(row.id);
      if (!local || row.updated_at > local.updated_at) {
        await table(name).put(fromRow(name, row));
        applied++;
      }
    }
  });
  return applied;
}

export async function pushOutbox(remote: Remote, userId: string): Promise<void> {
  const entries = await db.outbox.toArray();
  const byTable = new Map<TableName, typeof entries>();
  for (const e of entries) byTable.set(e.table, [...(byTable.get(e.table) ?? []), e]);
  for (const [name, list] of byTable) {
    const recs = (await table(name).bulkGet(list.map((e) => e.id))).filter(Boolean) as Base[];
    const rows = recs.map((r) => toRow(name, r, userId));
    if (rows.length) await remote.push(REMOTE[name], rows);
    // Only clear entries that did not change while pushing.
    await db.transaction('rw', db.outbox, async () => {
      for (const e of list) {
        const cur = await db.outbox.get(e.key);
        if (cur && cur.at === e.at) await db.outbox.delete(e.key);
      }
    });
  }
}

export async function pullAll(remote: Remote): Promise<void> {
  for (const name of TABLES) {
    const metaKey = `pulled:${name}`;
    const since = ((await db.meta.get(metaKey))?.value as string | undefined) ?? null;
    const rows = await remote.pull(REMOTE[name], since);
    if (!rows.length) continue;
    // Never overwrite a local change that has not been pushed yet with an older version.
    await mergeRemote(name, rows);
    const max = rows.reduce((m, r) => (r.server_updated_at && r.server_updated_at > m ? r.server_updated_at : m), since ?? '');
    if (max) await db.meta.put({ key: metaKey, value: max });
  }
}

export async function syncOnce(remote: Remote, userId: string): Promise<void> {
  await pushOutbox(remote, userId);
  await pullAll(remote);
}

// ---- engine with status ----
type Listener = (s: SyncState) => void;

export class SyncEngine {
  state: SyncState = 'synced';
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private cleanups: (() => void)[] = [];

  constructor(
    private remote: Remote | null,
    private userId: string,
  ) {
    if (!remote) this.state = 'local';
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(s: SyncState) {
    this.state = s;
    this.listeners.forEach((l) => l(s));
  }

  start(): void {
    if (!this.remote) return;
    this.cleanups.push(onLocalChange(() => this.schedule(2000)));
    const onVisible = () => document.visibilityState === 'visible' && this.now();
    const onOnline = () => this.now();
    const onOffline = () => this.set('offline');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    this.cleanups.push(() => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });
    this.interval = setInterval(() => this.now(), 60000);
    void this.now();
  }

  stop(): void {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    if (this.timer) clearTimeout(this.timer);
    if (this.interval) clearInterval(this.interval);
  }

  schedule(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.now(), ms);
  }

  async now(): Promise<void> {
    if (!this.remote) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.set('offline');
      return;
    }
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.set('syncing');
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await syncOnce(this.remote!, this.userId);
        } while (this.again);
        this.set(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'synced');
      } catch {
        this.set(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }
}
