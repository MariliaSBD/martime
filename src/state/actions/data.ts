import { db, table } from '@/db/db';
import { getRepoUser, stamp } from '@/db/repo';
import { TABLES, type TableName, type TimeEntry } from '@/db/types';

export async function exportAll(): Promise<string> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = (await table(t).toArray()).filter((r) => !r.deleted_at);
  return JSON.stringify({ app: 'MarTime', version: 1, exportedAt: new Date().toISOString(), data: out }, null, 2);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportTimeCsv(areaName: (id: string | null) => string): Promise<string> {
  const rows = (await db.timeEntries.toArray()).filter((e) => !e.deleted_at).sort((a, b) => (a.start < b.start ? -1 : 1));
  const head = ['start', 'end', 'minutes', 'activity', 'area', 'classification', 'source'];
  const lines = rows.map((e: TimeEntry) => [e.start, e.end ?? '', e.end ? Math.round((new Date(e.end).getTime() - new Date(e.start).getTime()) / 60000) : '', e.activity, areaName(e.areaId), e.classification, e.source].map(csvCell).join(','));
  return [head.join(','), ...lines].join('\n');
}

/** Replaces everything with the content of an export. Old records are soft-deleted so the deletion syncs. */
export async function importAll(json: string): Promise<void> {
  const parsed = JSON.parse(json) as { app?: string; data?: Record<string, Record<string, unknown>[]> };
  if (parsed.app !== 'MarTime' || !parsed.data) throw new Error('format');
  const user = getRepoUser();
  const now = stamp();
  await db.transaction('rw', [...TABLES.map((t) => table(t)), db.outbox], async () => {
    for (const t of TABLES as TableName[]) {
      if (t === 'pushSubs' || t === 'notifications') continue;
      const incoming = parsed.data![t] ?? [];
      const ids = new Set(incoming.map((r) => r.id as string));
      for (const cur of await table(t).toArray()) {
        if (!ids.has(cur.id) && !cur.deleted_at) {
          await table(t).put({ ...cur, deleted_at: now, updated_at: now } as never);
          await db.outbox.put({ key: `${t}:${cur.id}`, table: t, id: cur.id, at: Date.now() });
        }
      }
      for (const r of incoming) {
        const rec = { ...r, user_id: user, updated_at: stamp(), deleted_at: null };
        await table(t).put(rec as never);
        await db.outbox.put({ key: `${t}:${r.id}`, table: t, id: r.id as string, at: Date.now() });
      }
    }
  });
}

export function download(name: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
