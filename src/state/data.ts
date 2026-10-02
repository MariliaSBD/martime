import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, table } from '@/db/db';
import type { TableMap, TableName } from '@/db/types';
import { nowIso } from '@/lib/time';

export function useAll<K extends TableName>(name: K): TableMap[K][] | undefined {
  return useLiveQuery(async () => (await table(name).toArray()).filter((r) => !r.deleted_at), [name]);
}

/** Includes deleted records (needed for repeating tasks). */
export function useRaw<K extends TableName>(name: K): TableMap[K][] | undefined {
  return useLiveQuery(() => table(name).toArray(), [name]);
}

export function useOne<K extends TableName>(name: K, id: string | undefined): TableMap[K] | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    const r = await table(name).get(id);
    return r && !r.deleted_at ? r : null;
  }, [name, id]);
}

export function useAreas() {
  return useLiveQuery(async () => (await db.areas.toArray()).filter((a) => !a.deleted_at).sort((a, b) => a.order - b.order), []);
}

export function useBlocks() {
  return useLiveQuery(async () => (await db.energyBlocks.toArray()).filter((a) => !a.deleted_at).sort((a, b) => (a.start < b.start ? -1 : 1)), []);
}

/** Current instant, refreshed every `ms` (re-computed from the clock, never counted). */
export function useNow(ms = 1000): string {
  const [now, setNow] = useState(nowIso());
  useEffect(() => {
    const id = setInterval(() => setNow(nowIso()), ms);
    const vis = () => setNow(nowIso());
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [ms]);
  return now;
}
