import Dexie, { type Table } from 'dexie';
import type { TableMap, TableName } from './types';

export interface OutboxEntry {
  key: string; // `${table}:${id}`
  table: TableName;
  id: string;
  at: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

type Tables = { [K in TableName]: Table<TableMap[K], string> };

export class MarTimeDB extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  meta!: Table<MetaEntry, string>;

  constructor(name = 'martime') {
    super(name);
    this.version(1).stores({
      areas: 'id, updated_at, order',
      tasks: 'id, updated_at, date, seriesId, projectId, goalId, importantDateId',
      days: 'id, updated_at, date',
      timeEntries: 'id, updated_at, start, taskId',
      sessions: 'id, updated_at, start',
      places: 'id, updated_at',
      energyBlocks: 'id, updated_at',
      projects: 'id, updated_at',
      goals: 'id, updated_at, parentId',
      decisions: 'id, updated_at, date',
      reflections: 'id, updated_at, date',
      weeklyReviews: 'id, updated_at, weekStart',
      reorganizations: 'id, updated_at, date',
      importantDates: 'id, updated_at',
      settings: 'id, updated_at',
      trainingReports: 'id, updated_at',
      notifications: 'id, updated_at, key, send_at',
      pushSubs: 'id, updated_at',
      outbox: 'key, at',
      meta: 'key',
    });
  }
}

export interface MarTimeDB extends Tables {}

export let db = new MarTimeDB();

/** Used by tests to start from a clean database. */
export async function resetDb(): Promise<void> {
  db.close();
  await Dexie.delete(db.name);
  db = new MarTimeDB(db.name);
  await db.open();
}

export function table<K extends TableName>(name: K): Table<TableMap[K], string> {
  return (db as unknown as Tables)[name];
}
