import i18n from '@/i18n';
import { db } from '@/db/db';
import type { Decision, EnergyBlock, Goal, Project, Reflection, Reorganization, Settings, TrainingReport, TrainingSection, WeeklyReview } from '@/db/types';
import { computeStats, type Stats } from '../domain/stats';
import { goalProgress, expectedAt, pace, series, type GoalContext } from '../domain/goals';
import { expandItems } from '../domain/recurrence';
import { groupOf, planGroups } from '../domain/energy';
import { realMinutesOf } from '../domain/timeEntries';
import { addDays, dateKey, diffDays, localHHMM, nowIso, weekStart, type DateKey } from '../time';
import { fmtDate, fmtLongDate, fmtMinutes, fmtNumber, fmtTime, weekdayName } from '../format';
import { PALETTES, type PaletteId } from '../colors';
import type { Block, ReportDoc } from './blocks';
import { barsSvg, donutSvg, gridSvg, lineSvg, stackedSvg, timelineSvg } from './svg';
import { sessionData } from '@/screens/SessionDetail';
import { weekSummary } from '@/screens/WeekReview';
import { quadrantOf, QUADRANTS, weekTasks } from '@/screens/Tasks';
import type { DayData } from '@/screens/today/useToday';

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);

export interface AllData extends DayData {
  goals: Goal[];
  projects: Project[];
  decisions: Decision[];
  reflections: Reflection[];
  weeklyReviews: WeeklyReview[];
  reorganizations: Reorganization[];
  settings: Settings;
  training: TrainingReport | null;
}

export async function loadAll(settings: Settings): Promise<AllData> {
  const live = <T extends { deleted_at: string | null }>(xs: T[]) => xs.filter((x) => !x.deleted_at);
  const [raw, entries, days, areas, blocks, places, sessions, goals, projects, decisions, reflections, weeklyReviews, reorganizations, training] = await Promise.all([
    db.tasks.toArray(),
    db.timeEntries.toArray(),
    db.days.toArray(),
    db.areas.toArray(),
    db.energyBlocks.toArray(),
    db.places.toArray(),
    db.sessions.toArray(),
    db.goals.toArray(),
    db.projects.toArray(),
    db.decisions.toArray(),
    db.reflections.toArray(),
    db.weeklyReviews.toArray(),
    db.reorganizations.toArray(),
    db.trainingReports.get(settings.id),
  ]);
  return {
    raw,
    entries: live(entries),
    days: live(days),
    areas: live(areas).sort((a, b) => a.order - b.order),
    blocks: live(blocks),
    places: live(places),
    sessions: live(sessions),
    goals: live(goals),
    projects: live(projects),
    decisions: live(decisions),
    reflections: live(reflections),
    weeklyReviews: live(weeklyReviews),
    reorganizations: live(reorganizations),
    settings,
    training: training && !training.deleted_at ? training : null,
  };
}

function colors(p: PaletteId) {
  const pal = PALETTES[p];
  return { c: (n: number) => pal.colors[(n || 6) - 1], primary: pal.primary, a: pal.colors[5], b: pal.colors[3] };
}

const CLASS_HEX = (p: PaletteId) => ({ essential: PALETTES[p].colors[3], useful: PALETTES[p].colors[4], waste: PALETTES[p].colors[0], travel: PALETTES[p].colors[2] });

// ---------------- statistics blocks (shared by the period reports) ----------------
export function statsBlocks(s: Stats, palette: PaletteId): Block[] {
  const col = colors(palette);
  const b: Block[] = [];
  const nd = t('common.notEnoughData');
  b.push({ k: 'h2', text: `1. ${t('stats.s1')}` });
  b.push({ k: 'p', text: s.progress.pct === null ? nd : `${s.progress.pct}%${s.progress.delta !== null ? ` · ${t(s.progress.delta >= 0 ? 'stats.up' : 'stats.down', { n: Math.abs(s.progress.delta) })}` : ''}` });
  b.push({ k: 'h2', text: `2. ${t('stats.s2')}` });
  if (!s.plannedReal.planned && !s.plannedReal.real) b.push({ k: 'p', text: nd });
  else {
    b.push({ k: 'p', text: `${t('stats.planned')}: ${fmtMinutes(s.plannedReal.planned)} · ${t('stats.real')}: ${fmtMinutes(s.plannedReal.real)}` });
    const days = s.plannedReal.days.length > 31 ? [] : s.plannedReal.days;
    if (days.length) {
      b.push({ k: 'svg', svg: barsSvg(days.map((d) => ({ a: d.planned, b: d.real })), [col.a, col.b]), width: 480, alt: '' });
      b.push({ k: 'table', head: [t('common.date'), t('stats.planned'), t('stats.real')], rows: days.filter((d) => d.planned || d.real).map((d) => [fmtDate(d.date), fmtMinutes(d.planned), fmtMinutes(d.real)]) });
    }
  }
  b.push({ k: 'h2', text: `3. ${t('stats.s3')}` });
  b.push(s.accuracy.length ? { k: 'list', items: s.accuracy.map((a) => (a.kind === 'ok' ? t('stats.accurate', { area: a.name }) : t(a.kind === 'under' ? 'stats.under' : 'stats.over', { area: a.name, p: a.pct }))) } : { k: 'p', text: nd });
  b.push({ k: 'h2', text: `4. ${t('stats.s4')}` });
  b.push({ k: 'p', text: s.punctuality.count ? `${t('stats.onTimePct', { p: s.punctuality.onTimePct })}${s.punctuality.avgLate !== null ? ` · ${t('stats.avgLate', { n: s.punctuality.avgLate })}` : ''}` : nd });
  b.push({ k: 'h2', text: `5. ${t('stats.s5')}` });
  b.push({ k: 'p', text: s.reliability.count ? `${s.reliability.pct}% · ${t('stats.events', { count: s.reliability.count })}` : nd });
  b.push({ k: 'h2', text: `6. ${t('stats.s6')}` });
  b.push({ k: 'kv', rows: [[t('stats.dl.onTime'), String(s.deadlines.onTime)], [t('stats.dl.after'), String(s.deadlines.after)], [t('stats.dl.postponements'), String(s.deadlines.postponements)]] });
  b.push({ k: 'h2', text: `7. ${t('stats.s7')}` });
  if (!s.byArea.length) b.push({ k: 'p', text: nd });
  else {
    b.push({ k: 'svg', svg: donutSvg(s.byArea.map((a) => ({ value: a.minutes, color: a.color ? col.c(a.color) : '#9AA1B1' }))), width: 110, alt: '' });
    b.push({ k: 'table', head: [t('common.area'), t('stats.hours'), '%'], rows: s.byArea.map((a) => [a.name || t('stats.noArea'), fmtMinutes(a.minutes), `${a.pct}%`]) });
  }
  b.push({ k: 'h2', text: `8. ${t('stats.s8')}` });
  const ct = Object.values(s.classes).reduce((x, y) => x + y, 0);
  if (!ct) b.push({ k: 'p', text: nd });
  else {
    const hex = CLASS_HEX(palette);
    b.push({ k: 'svg', svg: stackedSvg((Object.keys(s.classes) as (keyof typeof s.classes)[]).map((k) => ({ value: s.classes[k], color: hex[k] }))), width: 480, alt: '' });
    b.push({ k: 'table', head: [t('today.classification'), t('stats.hours'), '%'], rows: (Object.keys(s.classes) as (keyof typeof s.classes)[]).map((k) => [t(`class.${k}`), fmtMinutes(s.classes[k]), `${Math.round((s.classes[k] / ct) * 100)}%`]) });
  }
  b.push({ k: 'h2', text: `9. ${t('stats.s9')}` });
  b.push(s.thieves.length ? { k: 'list', items: s.thieves.map((x) => `${x.name} · ${fmtMinutes(x.minutes)}`) } : { k: 'p', text: nd });
  b.push({ k: 'h2', text: `10. ${t('stats.s10')}` });
  if (!s.energy.length) b.push({ k: 'p', text: nd });
  else {
    const hours = [...new Set(s.energy.map((c) => c.hour))].sort((x, y) => x - y);
    const bg = (v: number) => (v >= 2.5 ? '#8CE99A' : v >= 1.5 ? '#FFE066' : '#FFA8A8');
    b.push({ k: 'svg', svg: gridSvg(s.energy.map((c) => ({ x: hours.indexOf(c.hour), y: c.weekday - 1, color: bg(c.avg) })), hours.length, 7), width: Math.min(480, hours.length * 20), alt: '' });
    b.push({ k: 'table', head: [t('stats.weekday'), t('stats.hour'), t('stats.avgEnergy'), 'n'], rows: [...s.energy].sort((x, y) => x.weekday - y.weekday || x.hour - y.hour).map((c) => [weekdayName(c.weekday), `${String(c.hour).padStart(2, '0')}h`, fmtNumber(c.avg), String(c.n)]) });
  }
  b.push({ k: 'h2', text: `11. ${t('stats.s11')}` });
  const sl = s.sleep.days.filter((d) => d.wake || d.bed || d.minutes);
  if (!sl.length) b.push({ k: 'p', text: nd });
  else {
    b.push({ k: 'p', text: [s.sleep.avgMinutes !== null ? t('stats.avgSleep', { t: fmtMinutes(s.sleep.avgMinutes) }) : '', s.sleep.wakeSpread !== null ? t('stats.wakeSpread', { n: s.sleep.wakeSpread }) : ''].filter(Boolean).join(' · ') });
    b.push({ k: 'table', head: [t('common.date'), t('stats.wake'), t('stats.bed'), t('stats.duration')], rows: sl.map((d) => [fmtDate(d.date), d.wake ? localHHMM(d.wake) : '—', d.bed ? localHHMM(d.bed) : '—', d.minutes !== null ? fmtMinutes(d.minutes) : '—']) });
  }
  b.push({ k: 'h2', text: `12. ${t('stats.s12')}` });
  if (!s.feelings.days.length) b.push({ k: 'p', text: nd });
  else {
    b.push({ k: 'svg', svg: lineSvg([{ values: s.feelings.days.map((d) => d.feeling), color: col.primary }], 480, 120, 5), width: 480, alt: '' });
    b.push({ k: 'table', head: [t('common.date'), '1–5'], rows: s.feelings.days.map((d) => [fmtDate(d.date), String(d.feeling)]) });
    if (s.feelings.goodSleepAvg !== null) b.push({ k: 'p', text: t('stats.goodSleep', { t: fmtMinutes(s.feelings.goodSleepAvg) }) });
  }
  b.push({ k: 'h2', text: `13. ${t('stats.s13')}` });
  b.push(s.routines.length ? { k: 'table', head: [t('goals.routine'), '%', t('stats.doneOfPlanned'), t('stats.streak')], rows: s.routines.map((r) => [r.title, `${r.stats.pct ?? 0}%`, `${r.stats.done}/${r.stats.planned}`, String(r.stats.streak)]) } : { k: 'p', text: nd });
  return b;
}

function goalCtx(d: AllData): GoalContext {
  return { tasks: d.raw.filter((x) => !x.deleted_at), entries: d.entries, goals: d.goals, now: nowIso() };
}

function cover(d: AllData, title: string, period: string): Omit<ReportDoc, 'sections'> {
  return { title, name: d.settings.name, course: d.settings.course, module: d.settings.module, period, generated: fmtLongDate(dateKey(nowIso())) };
}

export type PeriodType = 'week' | 'month' | 'year' | 'period';

/** 16.1: statistics, goals and weekly reviews of the period. */
export function periodReport(d: AllData, type: PeriodType, from: DateKey, to: DateKey, periodLabel: string): ReportDoc {
  const s = computeStats({ raw: d.raw, entries: d.entries, days: d.days, areas: d.areas, now: nowIso() }, from, to);
  const ctx = goalCtx(d);
  const goals = [...d.goals].sort((a, b) => a.order - b.order);
  const goalRows = goals.map((g) => {
    const p = goalProgress(g, ctx);
    const today = dateKey(ctx.now);
    const r = pace(p.value, expectedAt(g, p.target, today > g.dueDate ? g.dueDate : today), p.target);
    return [g.what + (g.isMain ? ` (${t('goals.main')})` : ''), `${p.pct}%`, `${fmtNumber(p.value)}/${fmtNumber(p.target)} ${g.unit}`, t(`goals.status.${g.status}`), r.status === 'on' ? t('goals.onPace') : t(r.status === 'above' ? 'goals.above' : 'goals.below', { n: fmtNumber(r.n) })];
  });
  const weeks = d.weeklyReviews.filter((w) => w.weekStart <= to && addDays(w.weekStart, 6) >= from).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const weekBlocks: Block[] = weeks.flatMap((w) => [
    { k: 'h2' as const, text: t('weeks.title', { from: fmtDate(w.weekStart), to: fmtDate(addDays(w.weekStart, 6)) }) },
    ...weekSummaryBlocks(d, w.weekStart),
    { k: 'quote' as const, label: t('weeks.q1'), text: w.q1 },
    { k: 'quote' as const, label: t('weeks.q2'), text: w.q2 },
    { k: 'quote' as const, label: t('weeks.q3'), text: w.q3 },
  ]);
  return {
    ...cover(d, t(`reports.titles.${type}`), periodLabel),
    sections: [
      { title: t('review.stats'), blocks: statsBlocks(s, d.settings.palette) },
      { title: t('nav.goals'), blocks: goalRows.length ? [{ k: 'table', head: [t('goals.what'), '%', t('goals.target'), t('detail.status'), t('goals.pace')], rows: goalRows, widths: ['*', 35, 70, 60, 80] }] : [{ k: 'p', text: t('goals.empty') }] },
      { title: t('review.weeks'), blocks: weekBlocks.length ? weekBlocks : [{ k: 'p', text: t('reports.noWeeks') }] },
    ],
  };
}

function weekSummaryBlocks(d: AllData, ws: DateKey): Block[] {
  const sum = weekSummary(d, ws, nowIso());
  const s = sum.stats;
  return [
    {
      k: 'kv',
      rows: [
        [t('stats.s1'), s.progress.pct !== null ? `${s.progress.pct}%` : t('common.noData')],
        [t('stats.s2'), `${fmtMinutes(s.plannedReal.planned)} · ${fmtMinutes(s.plannedReal.real)}`],
        [t('weeks.topAreas'), s.byArea.slice(0, 3).map((a) => `${a.name || t('stats.noArea')} (${fmtMinutes(a.minutes)})`).join(', ') || t('common.noData')],
        [t('stats.s4'), s.punctuality.onTimePct !== null ? t('stats.onTimePct', { p: s.punctuality.onTimePct }) : t('common.noData')],
        [t('weeks.best'), sum.best ? `${fmtDate(sum.best.date, { weekday: 'long' })} (${sum.best.pct}%)` : t('common.noData')],
        [t('weeks.worst'), sum.worst ? `${fmtDate(sum.worst.date, { weekday: 'long' })} (${sum.worst.pct}%)` : t('common.noData')],
        [t('stats.s9'), s.thieves.map((x) => `${x.name} (${fmtMinutes(x.minutes)})`).join(', ') || t('common.noData')],
      ],
    },
  ];
}

// ---------------- training report (16.2) ----------------
export const TRAINING_SECTIONS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 'close'] as const;
export type TrainingKey = (typeof TRAINING_SECTIONS)[number];
export const WITH_FEEDBACK: TrainingKey[] = ['t5', 't8'];

export function emptySection(): TrainingSection {
  return { sourceIds: [], justification: '', feedback: '' };
}

/** Sources actually used: the chosen ones, or the defaults for decisions (10 most recent) and reflections (role-play). */
export function effectiveSources(key: TrainingKey, sec: TrainingSection, d: AllData): string[] {
  if (sec.sourceIds.length) return sec.sourceIds;
  if (key === 't6') return [...d.decisions].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).slice(0, 10).map((x) => x.id);
  if (key === 't8') return d.reflections.filter((r) => r.context === 'roleplay').map((r) => r.id);
  return [];
}

export function sectionComplete(key: TrainingKey, sec: TrainingSection, d: AllData): boolean {
  return effectiveSources(key, sec, d).length > 0 && sec.justification.trim().length > 0;
}

export function trainingContent(key: TrainingKey, sources: string[], d: AllData): Block[] {
  const nd: Block = { k: 'p', text: t('training.noSource'), muted: true };
  const now = nowIso();
  switch (key) {
    case 't1': {
      const ws = sources[0];
      if (!ws) return [nd];
      const tasks = weekTasks(d.raw, ws);
      const rows = QUADRANTS.map((q) => [t(`matrix.${q.q}`), tasks.filter((x) => quadrantOf(x) === q.q).map((x) => x.title).join('; ') || '—', String(tasks.filter((x) => quadrantOf(x) === q.q).length)]);
      const unc = tasks.filter((x) => quadrantOf(x) === 'unclassified');
      if (unc.length) rows.push([t('matrix.unclassified'), unc.map((x) => x.title).join('; '), String(unc.length)]);
      const hard = tasks.filter((x) => x.hard);
      return [
        { k: 'p', text: `${fmtDate(ws)} – ${fmtDate(addDays(ws, 6))} · ${t('matrix.total', { count: tasks.length })}` },
        { k: 'table', head: [t('training.quadrant'), t('nav.tasks'), t('training.total')], rows, widths: [90, '*', 40] },
        ...(hard.length ? [{ k: 'h3' as const, text: t('training.hardTasks') }, { k: 'table' as const, head: [t('fields.title'), t('fields.hardReason')], rows: hard.map((x) => [x.title, x.hardReason]) }] : []),
      ];
    }
    case 't2': {
      const p = d.projects.find((x) => x.id === sources[0]);
      if (!p) return [nd];
      const steps = d.raw.filter((x) => x.projectId === p.id && !x.deleted_at);
      const from = p.startDate ?? steps.map((s) => s.date).filter(Boolean).sort()[0] ?? dateKey(now);
      const to = p.endDate ?? from;
      const span = Math.max(1, diffDays(from, to) + 1);
      const pos = (k: string) => Math.max(0, Math.min(1, diffDays(from, k) / span));
      const pal = PALETTES[d.settings.palette];
      return [
        { k: 'kv', rows: [[t('common.name'), p.name], [t('projects.objective'), p.objective], [t('training.period'), `${p.startDate ? fmtDate(p.startDate) : '—'} – ${p.endDate ? fmtDate(p.endDate) : '—'}`]] },
        { k: 'h3', text: t('projects.steps') },
        { k: 'table', head: [t('fields.title'), t('training.kind'), t('fields.deadline'), t('training.done')], rows: steps.map((s) => [s.title, s.critical ? t('projects.critical') : t('projects.accessory'), s.deadline ? fmtDate(dateKey(s.deadline)) : s.date ? fmtDate(s.date) : '—', s.status === 'done' ? t('common.yes') : t('common.no')]) },
        ...(steps.some((s) => s.date || s.deadline)
          ? [{ k: 'svg' as const, svg: timelineSvg(steps.filter((s) => s.date || s.deadline).map((s) => ({ start: pos(s.date ?? dateKey(s.deadline!)), end: pos(addDays(s.deadline ? dateKey(s.deadline) : s.date!, 1)), critical: s.critical, done: s.status === 'done' })), { critical: pal.primary, other: pal.colors[4] }), width: 480, alt: '' }]
          : []),
        { k: 'h3', text: t('projects.resources') },
        p.resources.length ? { k: 'list', items: p.resources.map((r) => r.text) } : { k: 'p', text: '—' },
        { k: 'h3', text: t('projects.obstacles') },
        p.obstacles.length ? { k: 'table', head: [t('projects.obstacle'), t('projects.plan')], rows: p.obstacles.map((o) => [o.obstacle, o.plan]) } : { k: 'p', text: '—' },
        { k: 'h3', text: t('projects.diary') },
        p.diary.length ? { k: 'table', head: [t('common.date'), t('common.notes')], rows: p.diary.map((x) => [fmtDate(x.date), x.text]), widths: [60, '*'] } : { k: 'p', text: '—' },
      ];
    }
    case 't3': {
      const day = sources[0];
      if (!day) return [nd];
      const items = expandItems(d.raw, day, day);
      const groups = planGroups(d.blocks, new Set(items.map((i) => groupOf(i, d.blocks))));
      const groupName = (id: string) => {
        const g = groups.find((x) => x.id === id);
        return g?.name ?? t(id === 'none' ? 'today.noTime' : `today.${id.replace('seg:', '')}`);
      };
      const blocks = [...d.blocks].sort((a, b) => a.start.localeCompare(b.start));
      return [
        { k: 'p', text: fmtLongDate(day) },
        { k: 'h3', text: t('onboarding.blocks') },
        blocks.length ? { k: 'table', head: [t('common.name'), t('common.start'), t('common.end'), t('blocks.level')], rows: blocks.map((b: EnergyBlock) => [b.name, b.start, b.end, t(`energy.${b.level}`)]) } : { k: 'p', text: '—' },
        { k: 'h3', text: t('training.tasksByBlock') },
        { k: 'table', head: [t('training.block'), t('fields.title'), t('fields.effort')], rows: items.filter((i) => i.kind === 'task').map((i) => [groupName(groupOf(i, d.blocks)), i.title, t(i.effort === 'unset' ? 'common.unset' : `fields.${i.effort}`)]) },
        { k: 'h3', text: t('training.planVsReal') },
        {
          k: 'table',
          head: [t('fields.title'), t('fields.plannedStart'), t('stats.planned'), t('detail.realStart'), t('stats.real')],
          rows: items.map((i) => {
            const first = d.entries.filter((e) => e.taskId === i.id && e.source === 'timer').sort((a, b) => a.start.localeCompare(b.start))[0];
            const real = i.kind === 'task' ? realMinutesOf(i, d.entries, now) : null;
            return [i.title, i.plannedStart ?? '—', fmtMinutes(i.plannedMinutes || 30), first ? fmtTime(first.start) : i.arrivedAt ? fmtTime(i.arrivedAt) : '—', real !== null ? fmtMinutes(real) : '—'];
          }),
        },
      ];
    }
    case 't4': {
      const s = d.sessions.find((x) => x.id === sources[0]);
      if (!s) return [nd];
      const sd = sessionData(s, d.entries, now);
      const total = Object.values(sd.dist).reduce((a, b) => a + b, 0);
      const hex = CLASS_HEX(d.settings.palette);
      return [
        { k: 'p', text: `${fmtDate(dateKey(s.start))} ${fmtTime(s.start)} – ${fmtDate(dateKey(s.end))} ${fmtTime(s.end)}` },
        { k: 'h3', text: t('session.table') },
        { k: 'table', head: [t('session.time'), t('today.activity'), t('today.classification')], rows: sd.table.map((r) => [`${fmtDate(dateKey(r.start))} ${fmtTime(r.start)}`, r.activity ?? t('time.noRecord'), r.classification ? t(`class.${r.classification}`) : '']), widths: [80, '*', 80] },
        { k: 'h3', text: t('session.distribution') },
        ...(total ? [{ k: 'svg' as const, svg: stackedSvg((Object.keys(sd.dist) as (keyof typeof sd.dist)[]).map((k) => ({ value: sd.dist[k], color: hex[k] }))), width: 480, alt: '' }] : []),
        { k: 'table', head: [t('today.classification'), t('stats.hours'), '%'], rows: (Object.keys(sd.dist) as (keyof typeof sd.dist)[]).map((k) => [t(`class.${k}`), fmtMinutes(sd.dist[k]), total ? `${Math.round((sd.dist[k] / total) * 100)}%` : '0%']) },
        { k: 'h3', text: t('session.thieves') },
        s.thieves.length ? { k: 'table', head: [t('today.activity'), t('stats.hours'), t('training.action')], rows: s.thieves.map((x) => [x.name, fmtMinutes(sd.thieves.find((y) => y.name.toLowerCase() === x.name.toLowerCase())?.minutes ?? 0), x.action]) } : { k: 'p', text: sd.thieves.length ? sd.thieves.map((x) => `${x.name} (${fmtMinutes(x.minutes)})`).join(', ') : t('session.noWaste') },
      ];
    }
    case 't5': {
      const r = d.reorganizations.find((x) => x.id === sources[0]);
      if (!r) return [nd];
      return [
        { k: 'kv', rows: [[t('common.date'), fmtDate(r.date)], [t('training.kind'), t(r.kind === 'simulation' ? 'reorg.simulation' : 'reorg.title')], [t('reorg.available'), fmtMinutes(r.availableMinutes)]] },
        { k: 'table', head: [t('training.order'), t('fields.title'), t('reorg.type'), t('training.decision'), t('reorg.minutes')], rows: [...r.items].sort((a, b) => a.order - b.order).map((i, n) => [i.decision === 'do' ? String(n + 1) : '—', i.title, t(`reorg.types.${i.itemType}`), t(`reorg.d.${i.decision}`) + (i.decision === 'delegate' && i.delegateTo ? ` (${i.delegateTo})` : i.decision === 'postpone' && i.postponeTo ? ` (${fmtDate(i.postponeTo)})` : ''), i.decision === 'do' ? String(i.minutes) : '—']), widths: [30, '*', 70, 90, 45] },
        { k: 'quote', label: t('reorg.criteria'), text: r.criteria },
      ];
    }
    case 't6': {
      const ds = sources.map((id) => d.decisions.find((x) => x.id === id)).filter(Boolean) as Decision[];
      if (!ds.length) return [nd];
      const cell = (impact: string, rev: string) => ds.filter((x) => x.impact === impact && x.reversibility === rev).map((x) => x.text).join('\n') || '—';
      return [
        { k: 'table', head: [t('decisions.text'), t('decisions.impact'), t('decisions.reversibility'), t('decisions.approach'), t('decisions.minutes')], rows: ds.map((x) => [x.text, t(x.impact === 'high' ? 'decisions.high' : 'decisions.low'), t(x.reversibility === 'easy' ? 'decisions.easy' : 'decisions.hard'), t(`decisions.approaches.${x.approach}`), x.minutes === null ? '—' : String(x.minutes)]), widths: ['*', 45, 75, 80, 45] },
        { k: 'h3', text: t('decisions.map') },
        { k: 'table', head: ['', t('decisions.easy'), t('decisions.hard')], rows: [[t('decisions.highImpact'), cell('high', 'easy'), cell('high', 'hard')], [t('decisions.lowImpact'), cell('low', 'easy'), cell('low', 'hard')]], widths: [80, '*', '*'] },
      ];
    }
    case 't7': {
      const gs = sources.map((id) => d.goals.find((x) => x.id === id)).filter(Boolean) as Goal[];
      if (!gs.length) return [nd];
      const ctx = goalCtx(d);
      const main = d.goals.find((g) => g.isMain);
      const pal = PALETTES[d.settings.palette];
      return [
        ...gs.flatMap((g) => {
          const p = goalProgress(g, ctx);
          const pts = series(g, ctx);
          const steps = ctx.tasks.filter((x) => x.goalId === g.id);
          return [
            { k: 'h3' as const, text: g.what },
            { k: 'kv' as const, rows: [[t('goals.what'), g.what], [t('goals.measure'), g.measure], [t('goals.realistic'), g.realistic], [t('goals.why'), g.why], [t('goals.until'), fmtDate(g.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })], [t('goals.progressLabel', { p: p.pct }), `${fmtNumber(p.value)}/${fmtNumber(p.target)} ${g.unit}`]] as [string, string][] },
            { k: 'svg' as const, svg: lineSvg([{ values: pts.map((x) => x.expected), color: '#6B7280', dashed: true }, { values: pts.map((x) => x.value), color: pal.primary }], 480, 140), width: 480, alt: '' },
            { k: 'p' as const, text: `${t('goals.actual')} — ${t('goals.expected')} - - -`, muted: true },
            { k: 'p' as const, text: `${t('goals.plan')}:`, bold: true },
            steps.length ? { k: 'table' as const, head: [t('fields.title'), t('common.date'), t('training.done')], rows: steps.map((s) => [s.title, s.date ? fmtDate(s.date) : '—', s.status === 'done' ? t('common.yes') : t('common.no')]) } : { k: 'p' as const, text: '—' },
            { k: 'p' as const, text: `${t('goals.reviews')}:`, bold: true },
            g.reviews.length ? { k: 'table' as const, head: [t('common.date'), '%', t('goals.howAmI'), t('goals.adjust')], rows: g.reviews.map((r) => [fmtDate(r.date), r.progress === null ? '—' : `${r.progress}%`, r.how, r.adjust]) } : { k: 'p' as const, text: '—' },
          ];
        }),
        { k: 'h3', text: t('goals.main') },
        { k: 'kv', rows: [[t('goals.main'), main?.what ?? '—'], [t('goals.mainWhy'), main?.mainWhy ?? '—']] },
      ];
    }
    case 't8': {
      const rs = sources.map((id) => d.reflections.find((x) => x.id === id)).filter(Boolean) as Reflection[];
      if (!rs.length) return [nd];
      return rs.flatMap((r) => [
        { k: 'h3' as const, text: r.situation },
        {
          k: 'kv' as const,
          rows: [
            [t('reflections.situation'), r.situation],
            [t('reflections.type'), t(`reflections.types.${r.type}`)],
            [t('reflections.attitude'), r.attitude ? `${t(`reflections.attitudes.${r.attitude}`)} (${t(`reflections.attitudeDesc.${r.attitude}`)})` : '—'],
            [t('reflections.did'), r.did],
            [t('reflections.reasoning'), r.reasoning],
            [t('reflections.outcome'), r.outcome],
            [t('reflections.differently'), r.differently],
          ] as [string, string][],
        },
      ]);
    }
    case 'close': {
      const w = d.weeklyReviews.find((x) => x.id === sources[0]) ?? (sources[0] ? { weekStart: sources[0], q1: '', q2: '', q3: '' } : null);
      if (!w) return [nd];
      return [
        { k: 'p', text: t('weeks.title', { from: fmtDate(w.weekStart), to: fmtDate(addDays(w.weekStart, 6)) }) },
        { k: 'quote', label: t('weeks.q1'), text: w.q1 },
        { k: 'quote', label: t('weeks.q2'), text: w.q2 },
        { k: 'quote', label: t('weeks.q3'), text: w.q3 },
      ];
    }
  }
}

export function trainingReport(d: AllData): ReportDoc {
  const sections = TRAINING_SECTIONS.map((key) => {
    const sec = d.training?.sections[key] ?? emptySection();
    const blocks: Block[] = [...trainingContent(key, effectiveSources(key, sec, d), d), { k: 'quote', label: t('training.justification'), text: sec.justification }];
    if (WITH_FEEDBACK.includes(key)) blocks.push({ k: 'quote', label: t('reorg.feedback'), text: sec.feedback });
    return { title: t(`training.sections.${key}`), blocks };
  });
  return { ...cover(d, t('reports.titles.training'), t('reports.trainingPeriod')), sections };
}

export function reportLabels() {
  return { name: t('settings.name'), course: t('settings.course'), module: t('settings.module'), period: t('reports.period'), generated: t('reports.generated') };
}

export function defaultWeekSource(now: string): DateKey {
  return addDays(weekStart(dateKey(now)), -7);
}

