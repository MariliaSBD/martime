import { db } from '@/db/db';
import { create, remove, update } from '@/db/repo';
import { areaColorIndex } from '@/lib/colors';
import type { Area } from '@/db/types';

export async function liveAreas(): Promise<Area[]> {
  return (await db.areas.toArray()).filter((a) => !a.deleted_at).sort((a, b) => a.order - b.order);
}

export async function createArea(name: string): Promise<Area> {
  const list = await liveAreas();
  return create('areas', { name: name.trim(), color: areaColorIndex(list.length), order: (list[list.length - 1]?.order ?? -1) + 1 });
}

export async function createDefaultAreas(names: string[]): Promise<void> {
  if ((await liveAreas()).length) return;
  for (const n of names) await createArea(n);
}

/** Number of items that use the area. */
export async function areaUsage(id: string): Promise<number> {
  const counts = await Promise.all([
    db.tasks.filter((x) => !x.deleted_at && x.areaId === id).count(),
    db.timeEntries.filter((x) => !x.deleted_at && x.areaId === id).count(),
    db.projects.filter((x) => !x.deleted_at && x.areaId === id).count(),
    db.goals.filter((x) => !x.deleted_at && x.areaId === id).count(),
    db.decisions.filter((x) => !x.deleted_at && x.areaId === id).count(),
    db.importantDates.filter((x) => !x.deleted_at && x.areaId === id).count(),
  ]);
  return counts.reduce((s, n) => s + n, 0);
}

/** D2: deleting an area that has items moves them to another area first. */
export async function deleteArea(id: string, moveTo: string | null): Promise<void> {
  if (moveTo) {
    for (const name of ['tasks', 'timeEntries', 'projects', 'goals', 'decisions', 'importantDates'] as const) {
      const rows = await (db[name] as unknown as { filter: (f: (x: { areaId: string | null; deleted_at: string | null }) => boolean) => { toArray: () => Promise<{ id: string }[]> } }).filter((x) => !x.deleted_at && x.areaId === id).toArray();
      for (const r of rows) await update(name, r.id, { areaId: moveTo } as never);
    }
  }
  await remove('areas', id);
}

export async function moveArea(id: string, dir: -1 | 1): Promise<void> {
  const list = await liveAreas();
  const i = list.findIndex((a) => a.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  await update('areas', list[i].id, { order: list[j].order });
  await update('areas', list[j].id, { order: list[i].order });
}
