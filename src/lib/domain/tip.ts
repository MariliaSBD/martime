import type { Area, EnergyBlock, Task, Tip, TimeEntry } from '@/db/types';
import { addDays, roundTo, type DateKey } from '../time';
import { groupOf, levelOfGroup, demandingInLow, sortedBlocks } from './energy';
import { punctualityItems } from './punctuality';
import { gapMinutes, realMinutesOf, timeThieves, minutesByClassification } from './timeEntries';

export interface TipInput {
  date: DateKey;
  pct: number | null;
  /** items of the day (tasks and events) */
  items: Task[];
  /** all tasks (for the last 7 / 14 days) */
  allTasks: Task[];
  entries: TimeEntry[];
  /** entries inside the active day */
  dayEntries: TimeEntry[];
  blocks: EnergyBlock[];
  areas: Area[];
  activeFrom: string;
  activeTo: string;
  now: string;
}

type Line = { rule: string; values: Record<string, string | number> };

/** Overtime count and average real/planned ratio of an area in a window of days ending on `date`. */
function areaHistory(input: TipInput, areaId: string, days: number) {
  const from = addDays(input.date, -(days - 1));
  const list = input.allTasks.filter((t) => t.kind === 'task' && !t.deleted_at && t.areaId === areaId && t.date && t.date >= from && t.date <= input.date && t.plannedMinutes > 0);
  const withReal = list.map((t) => ({ t, real: realMinutesOf(t, input.entries, input.now) })).filter((x) => x.real !== null && x.real > 0) as { t: Task; real: number }[];
  return {
    over: withReal.filter((x) => x.real > x.t.plannedMinutes).length,
    ratio: withReal.length ? withReal.reduce((s, x) => s + x.real / x.t.plannedMinutes, 0) / withReal.length : 1,
  };
}

export function buildTip(input: TipInput): Tip {
  const { items, blocks, entries, now } = input;
  const tasks = items.filter((i) => i.kind === 'task' && !i.deleted_at);
  const events = items.filter((i) => i.kind === 'event' && !i.deleted_at);
  const pct = input.pct ?? 0;

  // ---- Correu bem ----
  let good: Line = { rule: 'B6', values: {} };
  const punct = punctualityItems(items, entries);
  const withReal = tasks.map((t) => ({ t, real: realMinutesOf(t, entries, now) })).filter((x) => x.real !== null) as { t: Task; real: number }[];
  const demandingDone = tasks.filter((t) => t.effort === 'demanding' && t.status === 'done');
  if (input.pct !== null && pct >= 80) good = { rule: 'B1', values: { p: pct } };
  else if (punct.length >= 3 && punct.every((p) => p.onTime)) good = { rule: 'B2', values: {} };
  else if (withReal.length >= 3) {
    const planned = withReal.reduce((s, x) => s + (x.t.plannedMinutes || 30), 0);
    const real = withReal.reduce((s, x) => s + x.real, 0);
    const d = Math.round((Math.abs(real - planned) / planned) * 100);
    if (d <= 10) good = { rule: 'B3', values: { d } };
  }
  if (good.rule === 'B6' && demandingDone.length >= 1 && demandingDone.every((t) => levelOfGroup(groupOf(t, blocks), blocks) === 'high')) good = { rule: 'B4', values: {} };
  if (good.rule === 'B6' && input.pct !== null && pct >= 50) good = { rule: 'B5', values: { p: pct } };

  // ---- A observar ----
  let watch: Line | null = null;
  const badEvent = events.find((e) => e.eventStatus === 'postponed' || e.eventStatus === 'cancelled_me' || e.eventStatus === 'missed');
  if (badEvent) watch = { rule: 'O1', values: { event: badEvent.title, status: badEvent.eventStatus! } };

  let o2: { t: Task; real: number } | null = null;
  if (!watch) {
    for (const x of withReal) {
      const planned = x.t.plannedMinutes || 30;
      if (x.real >= planned * 1.5 && x.real - planned >= 15 && (!o2 || x.real - planned > o2.real - (o2.t.plannedMinutes || 30))) o2 = x;
    }
    if (o2) {
      const values: Record<string, string | number> = { task: o2.t.title, realMin: Math.round(o2.real), plannedMin: o2.t.plannedMinutes || 30 };
      const h = areaHistory(input, o2.t.areaId, 7);
      if (h.over >= 3) {
        values.n = h.over;
        values.area = input.areas.find((a) => a.id === o2!.t.areaId)?.name ?? '';
      }
      watch = { rule: 'O2', values };
    }
  }
  if (!watch) {
    const known = punct.filter((p) => p.late !== null);
    if (known.length >= 2) {
      const avg = Math.round(known.reduce((s, p) => s + Math.max(0, p.late!), 0) / known.length);
      if (avg >= 15) watch = { rule: 'O3', values: { min: avg } };
    }
  }
  if (!watch) {
    const waste = minutesByClassification(input.dayEntries, now).waste;
    if (waste >= 60) watch = { rule: 'O4', values: { timeMin: Math.round(waste), activity: timeThieves(input.dayEntries, now)[0]?.name ?? '' } };
  }
  if (!watch) {
    const low = tasks.find((t) => demandingInLow(t, blocks));
    if (low) watch = { rule: 'O5', values: { task: low.title } };
  }
  if (!watch) {
    const gap = gapMinutes(input.dayEntries, input.activeFrom, input.activeTo, now);
    if (gap >= 120) watch = { rule: 'O6', values: { timeMin: Math.round(gap) } };
  }

  // ---- Para amanhã ----
  let tomorrow: Line = { rule: 'T_none', values: {} };
  if (watch) {
    switch (watch.rule) {
      case 'O2': {
        const ratio = areaHistory(input, o2!.t.areaId, 14).ratio;
        tomorrow = { rule: 'T_O2', values: { suggestionMin: roundTo((o2!.t.plannedMinutes || 30) * ratio, 15), task: o2!.t.title } };
        break;
      }
      case 'O4':
        tomorrow = { rule: 'T_O4', values: { activity: watch.values.activity } };
        break;
      case 'O5': {
        const high = sortedBlocks(blocks).find((b) => b.level === 'high');
        tomorrow = high ? { rule: 'T_O5', values: { block: high.name } } : { rule: 'T_none', values: {} };
        break;
      }
      default:
        tomorrow = { rule: `T_${watch.rule}`, values: {} };
    }
  }

  return { intro: input.pct !== null && pct < 40, good, watch, tomorrow };
}
