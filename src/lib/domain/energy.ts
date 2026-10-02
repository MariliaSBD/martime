import type { EnergyBlock, EnergyLevel, Task } from '@/db/types';
import { addDays, dateKey, diffDays, hhmmToMinutes, localParts, minutesToHHMM, toDate } from '../time';

export interface PlanGroup {
  id: string; // block id, 'seg:morning' | 'seg:afternoon' | 'seg:evening' | 'none'
  name: string | null; // block name, or null for provisional segments (translated in UI)
  level: EnergyLevel | null;
  start: string | null;
  end: string | null;
}

export const SEGMENTS: PlanGroup[] = [
  { id: 'seg:morning', name: null, level: null, start: '00:00', end: '12:00' },
  { id: 'seg:afternoon', name: null, level: null, start: '12:00', end: '19:00' },
  { id: 'seg:evening', name: null, level: null, start: '19:00', end: '24:00' },
];
export const NO_TIME: PlanGroup = { id: 'none', name: null, level: null, start: null, end: null };

const inRange = (m: number, s: string, e: string) => m >= hhmmToMinutes(s) && m < (e === '24:00' ? 1440 : hhmmToMinutes(e));

/** Validation for the block form: end after start and no overlap with other blocks. */
export function blockError(b: Pick<EnergyBlock, 'id' | 'start' | 'end'>, others: EnergyBlock[]): 'order' | 'overlap' | null {
  const s = hhmmToMinutes(b.start);
  const e = hhmmToMinutes(b.end);
  if (e <= s) return 'order';
  for (const o of others) {
    if (o.id === b.id || o.deleted_at) continue;
    if (s < hhmmToMinutes(o.end) && hhmmToMinutes(o.start) < e) return 'overlap';
  }
  return null;
}

export function sortedBlocks(blocks: EnergyBlock[]): EnergyBlock[] {
  return blocks.filter((b) => !b.deleted_at).sort((a, b) => (a.start < b.start ? -1 : 1));
}

/**
 * 5.13 grouping: by the chosen block; else by planned start; else "Sem hora".
 * A start outside every block falls in the provisional segment of that hour.
 */
export function groupOf(task: Pick<Task, 'energyBlockId' | 'plannedStart'>, blocks: EnergyBlock[]): string {
  const live = sortedBlocks(blocks);
  if (task.energyBlockId && live.some((b) => b.id === task.energyBlockId)) return task.energyBlockId;
  if (task.plannedStart) {
    const m = hhmmToMinutes(task.plannedStart);
    const b = live.find((x) => inRange(m, x.start, x.end));
    if (b) return b.id;
    return SEGMENTS.find((s) => inRange(m, s.start!, s.end!))!.id;
  }
  return NO_TIME.id;
}

/** Ordered groups for the plan: blocks (or provisional segments) and "Sem hora" at the end. */
export function planGroups(blocks: EnergyBlock[], usedIds: Set<string>): PlanGroup[] {
  const live = sortedBlocks(blocks).map<PlanGroup>((b) => ({ id: b.id, name: b.name, level: b.level, start: b.start, end: b.end }));
  const groups = live.length ? [...live, ...SEGMENTS.filter((s) => usedIds.has(s.id))] : [...SEGMENTS];
  groups.sort((a, b) => (a.start! < b.start! ? -1 : a.start! > b.start! ? 1 : 0));
  return [...groups, NO_TIME];
}

/** Warning icon when the task has a time outside its chosen block. */
export function outsideBlock(task: Pick<Task, 'energyBlockId' | 'plannedStart'>, blocks: EnergyBlock[]): boolean {
  if (!task.energyBlockId || !task.plannedStart) return false;
  const b = blocks.find((x) => x.id === task.energyBlockId && !x.deleted_at);
  return !!b && !inRange(hhmmToMinutes(task.plannedStart), b.start, b.end);
}

export function levelOfGroup(groupId: string, blocks: EnergyBlock[]): EnergyLevel | null {
  return blocks.find((b) => b.id === groupId && !b.deleted_at)?.level ?? null;
}

/** Demanding task in a low-energy block. */
export function demandingInLow(task: Pick<Task, 'effort' | 'energyBlockId' | 'plannedStart'>, blocks: EnergyBlock[]): boolean {
  return task.effort === 'demanding' && levelOfGroup(groupOf(task, blocks), blocks) === 'low';
}

export interface EnergyRecord {
  at: string;
  level: EnergyLevel;
}

const VALUE: Record<EnergyLevel, number> = { high: 3, medium: 2, low: 1 };

/**
 * 5.13 suggestion: with ≥ 14 days and ≥ 30 records, average by hour (hours with ≥ 3 records);
 * the longest run of ≥ 2 consecutive hours with average ≥ 2.5.
 */
export function suggestBlock(records: EnergyRecord[], now: string): { start: string; end: string } | null {
  if (records.length < 30) return null;
  const today = dateKey(now);
  const first = records.reduce((m, r) => (r.at < m ? r.at : m), records[0].at);
  if (diffDays(dateKey(first), today) < 14) return null;
  const from = addDays(today, -14);
  const recent = records.filter((r) => dateKey(r.at) >= from && toDate(r.at).getTime() <= toDate(now).getTime());
  const sums = new Array(24).fill(0);
  const counts = new Array(24).fill(0);
  for (const r of recent) {
    const h = localParts(r.at).hour;
    sums[h] += VALUE[r.level];
    counts[h]++;
  }
  let best: [number, number] | null = null;
  let runStart = -1;
  for (let h = 0; h <= 24; h++) {
    const ok = h < 24 && counts[h] >= 3 && sums[h] / counts[h] >= 2.5;
    if (ok && runStart < 0) runStart = h;
    if (!ok && runStart >= 0) {
      const len = h - runStart;
      if (len >= 2 && (!best || len > best[1] - best[0])) best = [runStart, h];
      runStart = -1;
    }
  }
  return best ? { start: minutesToHHMM(best[0] * 60), end: best[1] === 24 ? '24:00' : minutesToHHMM(best[1] * 60) } : null;
}

export function canShowEnergySuggestion(lastShown: string | null, now: string): boolean {
  return !lastShown || diffDays(dateKey(lastShown), dateKey(now)) >= 14;
}
