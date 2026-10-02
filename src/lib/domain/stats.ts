import type { Area, Classification, Day, EnergyLevel, Task, TimeEntry } from '@/db/types';
import { addDays, dateKey, diffDays, isoWeekday, localMinutes, localParts, rangeKeys, toDate, type DateKey } from '../time';
import { expandItems, isSeries } from './recurrence';
import { combine, progressOf } from './progress';
import { punctualityItems, punctualityStats, reliability, type PunctualityStats } from './punctuality';
import { deadlineOutcome } from './deadlines';
import { clippedMinutes, realMinutesOf, timeThieves, type Thief } from './timeEntries';
import { routineStats, type RoutineStats } from './routines';
import { atLocal } from '../time';

export interface StatsInput {
  raw: Task[];
  entries: TimeEntry[];
  days: Day[];
  areas: Area[];
  now: string;
}

export interface Stats {
  from: DateKey;
  to: DateKey;
  progress: { pct: number | null; prevPct: number | null; delta: number | null };
  plannedReal: { days: { date: DateKey; planned: number; real: number }[]; planned: number; real: number };
  accuracy: { areaId: string; name: string; n: number; pct: number; kind: 'under' | 'over' | 'ok' }[];
  punctuality: PunctualityStats;
  reliability: { pct: number | null; count: number };
  deadlines: { onTime: number; after: number; postponements: number };
  byArea: { areaId: string | null; name: string; color: number; minutes: number; pct: number }[];
  classes: Record<Classification, number>;
  thieves: Thief[];
  energy: { weekday: number; hour: number; avg: number; n: number }[];
  sleep: { days: { date: DateKey; wake: string | null; bed: string | null; minutes: number | null }[]; avgMinutes: number | null; wakeSpread: number | null };
  feelings: { days: { date: DateKey; feeling: number }[]; goodSleepAvg: number | null };
  routines: { id: string; title: string; stats: RoutineStats }[];
}

const LEVEL: Record<EnergyLevel, number> = { high: 3, medium: 2, low: 1 };

/** Sum of weighted credits per day (frozen when the day was ended). */
function daySums(input: StatsInput, items: Task[], dates: DateKey[]): { done: number; total: number }[] {
  return dates.map((d) => {
    const frozen = input.days.find((x) => x.date === d && x.endedAt && x.frozen)?.frozen;
    if (frozen) return frozen;
    return progressOf(items.filter((i) => i.date === d));
  });
}

function std(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.round(Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length));
}

export function computeStats(input: StatsInput, from: DateKey, to: DateKey): Stats {
  const today = dateKey(input.now);
  const end = to < today ? to : today;
  const dates = rangeKeys(from, to);
  const pastDates = end >= from ? rangeKeys(from, end) : [];
  const items = expandItems(input.raw, from, to);
  const pastItems = items.filter((i) => i.date! <= end);
  const tasks = pastItems.filter((i) => i.kind === 'task');
  const fromI = atLocal(from, '00:00').toISOString();
  const toI = atLocal(addDays(to, 1), '00:00').toISOString();
  const inRange = (iso: string | null | undefined) => !!iso && iso >= fromI && iso < toI;

  // 1. progress and variation
  const len = diffDays(from, to) + 1;
  const pFrom = addDays(from, -len);
  const pTo = addDays(from, -1);
  const prevItems = expandItems(input.raw, pFrom, pTo);
  const cur = combine(daySums(input, pastItems, pastDates)).pct;
  const prev = combine(daySums(input, prevItems, rangeKeys(pFrom, pTo))).pct;

  // 2. planned / real by day
  const prDays = dates.map((d) => {
    const its = items.filter((i) => i.date === d);
    let planned = 0;
    let real = 0;
    for (const t of its) {
      planned += t.plannedMinutes || 30;
      if (t.kind === 'task') real += realMinutesOf(t, input.entries, input.now) ?? 0;
      else if (t.eventStatus === 'ontime' || t.eventStatus === 'late') real += t.plannedMinutes || 30;
    }
    return { date: d, planned: Math.round(planned), real: Math.round(real) };
  });

  // 3. estimation accuracy by area (≥ 5 tasks with real time)
  const accuracy: Stats['accuracy'] = [];
  for (const a of input.areas) {
    const withReal = tasks
      .filter((t) => t.areaId === a.id && t.plannedMinutes > 0)
      .map((t) => ({ t, r: realMinutesOf(t, input.entries, input.now) }))
      .filter((x) => x.r !== null && x.r > 0) as { t: Task; r: number }[];
    if (withReal.length < 5) continue;
    const ratio = withReal.reduce((s, x) => s + x.r, 0) / withReal.reduce((s, x) => s + x.t.plannedMinutes, 0);
    const pct = Math.round(Math.abs(ratio - 1) * 100);
    accuracy.push({ areaId: a.id, name: a.name, n: withReal.length, pct, kind: pct < 5 ? 'ok' : ratio > 1 ? 'under' : 'over' });
  }

  // 6. deadlines
  const allReal = input.raw.filter((t) => !t.deleted_at);
  let onTime = 0;
  let after = 0;
  for (const t of allReal) {
    if (t.deadline && t.status === 'done' && t.completedAt && inRange(t.completedAt)) {
      if (deadlineOutcome(t.deadline, t.completedAt) === 'after') after++;
      else onTime++;
    }
  }
  const postponements = allReal.reduce((s, t) => s + t.history.filter((h) => inRange(h.at)).length, 0);

  // 7–9. time by area, classification, thieves (sleep is shown in its own card)
  const periodEntries = input.entries.filter((e) => !e.deleted_at && e.source !== 'sleep' && toDate(e.end ?? input.now) > toDate(fromI) && toDate(e.start) < toDate(toI));
  const clip = (e: TimeEntry) => clippedMinutes(e, input.now, fromI, toI);
  const areaMin = new Map<string | null, number>();
  const classes: Record<Classification, number> = { essential: 0, useful: 0, waste: 0, travel: 0 };
  for (const e of periodEntries) {
    const m = clip(e);
    areaMin.set(e.areaId, (areaMin.get(e.areaId) ?? 0) + m);
    classes[e.classification] += Math.round(m);
  }
  const totalArea = [...areaMin.values()].reduce((s, x) => s + x, 0);
  const byArea = [...areaMin.entries()]
    .map(([id, m]) => {
      const a = input.areas.find((x) => x.id === id);
      return { areaId: id, name: a?.name ?? '', color: a?.color ?? 0, minutes: Math.round(m), pct: totalArea ? Math.round((m / totalArea) * 100) : 0 };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const thieves = timeThieves(
    periodEntries.map((e) => ({ ...e, start: e.start < fromI ? fromI : e.start, end: e.end && e.end > toI ? toI : e.end })),
    input.now,
  ).slice(0, 5);

  // 10. energy heat map
  const cells = new Map<string, { sum: number; n: number; weekday: number; hour: number }>();
  for (const t of allReal) {
    if (!t.energyAtDone || !inRange(t.completedAt)) continue;
    const wd = isoWeekday(dateKey(t.completedAt!));
    const h = localParts(t.completedAt!).hour;
    const k = `${wd}-${h}`;
    const c = cells.get(k) ?? { sum: 0, n: 0, weekday: wd, hour: h };
    c.sum += LEVEL[t.energyAtDone];
    c.n++;
    cells.set(k, c);
  }
  const energy = [...cells.values()].map((c) => ({ weekday: c.weekday, hour: c.hour, avg: Math.round((c.sum / c.n) * 10) / 10, n: c.n }));

  // 11. sleep
  const sleepEntries = input.entries.filter((e) => !e.deleted_at && e.source === 'sleep' && e.end);
  const sleepDays = pastDates.map((d) => {
    const day = input.days.find((x) => x.date === d);
    const s = sleepEntries.find((e) => dateKey(e.end!) === d);
    return { date: d, wake: day ? day.startedAt : null, bed: day?.endedAt ?? null, minutes: s ? Math.round(clippedMinutes(s, input.now)) : null };
  });
  const sleepMins = sleepDays.map((d) => d.minutes).filter((x): x is number => x !== null);
  const wakeMins = sleepDays.map((d) => (d.wake ? localMinutes(d.wake) : null)).filter((x): x is number => x !== null);

  // 12. feelings
  const feelDays = input.days.filter((d) => d.date >= from && d.date <= to && d.feeling).map((d) => ({ date: d.date, feeling: d.feeling! }));
  let goodSleepAvg: number | null = null;
  if (feelDays.length >= 10) {
    const goodSleeps = feelDays.filter((d) => d.feeling >= 4).map((d) => sleepEntries.find((e) => dateKey(e.end!) === d.date)).filter(Boolean) as TimeEntry[];
    if (goodSleeps.length) goodSleepAvg = Math.round(goodSleeps.reduce((s, e) => s + clippedMinutes(e, input.now), 0) / goodSleeps.length);
  }

  // 13. routines
  const routines = input.raw
    .filter((t) => !t.deleted_at && isSeries(t) && t.date! <= end)
    .map((t) => ({ id: t.id, title: t.title, stats: routineStats(t, input.raw, end, from) }))
    .filter((r) => r.stats.planned > 0);

  return {
    from,
    to,
    progress: { pct: cur, prevPct: prev, delta: cur !== null && prev !== null ? cur - prev : null },
    plannedReal: { days: prDays, planned: prDays.reduce((s, d) => s + d.planned, 0), real: prDays.reduce((s, d) => s + d.real, 0) },
    accuracy,
    punctuality: punctualityStats(punctualityItems(pastItems, input.entries)),
    reliability: reliability(pastItems.filter((i) => i.kind === 'event')),
    deadlines: { onTime, after, postponements },
    byArea,
    classes,
    thieves,
    energy,
    sleep: { days: sleepDays, avgMinutes: sleepMins.length ? Math.round(sleepMins.reduce((s, x) => s + x, 0) / sleepMins.length) : null, wakeSpread: std(wakeMins) },
    feelings: { days: feelDays, goodSleepAvg },
    routines,
  };
}
