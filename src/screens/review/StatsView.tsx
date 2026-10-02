import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Card, IconButton, Input, Segmented, Field } from '@/components/ui';
import { computeStats, type Stats } from '@/lib/domain/stats';
import { addDays, addMonths, dateKey, localHHMM, monthStart, weekStart, type DateKey } from '@/lib/time';
import { fmtDate, fmtMinutes, fmtMonth, fmtNumber, weekdayName } from '@/lib/format';
import { useDayData } from '../today/useToday';
import { useNow } from '@/state/data';
import { CLASS_COLORS } from '../SessionDetail';
import type { Classification } from '@/db/types';

export type PeriodKind = 'day' | 'week' | 'month' | 'year' | 'custom';

export function periodRange(kind: PeriodKind, anchor: DateKey, custom?: [DateKey, DateKey]): [DateKey, DateKey] {
  switch (kind) {
    case 'day':
      return [anchor, anchor];
    case 'week':
      return [weekStart(anchor), addDays(weekStart(anchor), 6)];
    case 'month':
      return [monthStart(anchor), addDays(addMonths(monthStart(anchor), 1), -1)];
    case 'year':
      return [`${anchor.slice(0, 4)}-01-01`, `${anchor.slice(0, 4)}-12-31`];
    case 'custom':
      return custom ?? [anchor, anchor];
  }
}

export function periodTitle(kind: PeriodKind, from: DateKey, to: DateKey): string {
  if (kind === 'day') return fmtDate(from, { weekday: 'long', day: 'numeric', month: 'long' });
  if (kind === 'month') return `${fmtMonth(Number(from.slice(0, 4)), Number(from.slice(5, 7)))} ${from.slice(0, 4)}`;
  if (kind === 'year') return from.slice(0, 4);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

function StatCard({ title, value, children, empty, testId }: { title: string; value?: ReactNode; children?: ReactNode; empty?: boolean; testId?: string }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col gap-2" data-testid={testId}>
      <h3 className="text-base font-semibold">{title}</h3>
      {empty ? (
        <p className="text-[15px] text-muted">{t('common.notEnoughData')}</p>
      ) : (
        <>
          {value !== undefined && <p className="text-2xl font-bold">{value}</p>}
          {children}
        </>
      )}
    </Card>
  );
}

const AXIS = { fontSize: 13, fill: '#1F2333' };

export function StatsCards({ s, kind }: { s: Stats; kind: PeriodKind }) {
  const { t } = useTranslation();
  const prDays = s.plannedReal.days.map((d) => ({ ...d, label: kind === 'year' ? d.date.slice(5) : fmtDate(d.date) }));
  // the year view shows months instead of 365 bars
  const prRows =
    kind === 'year'
      ? Array.from({ length: 12 }, (_, i) => {
          const m = String(i + 1).padStart(2, '0');
          const ds = s.plannedReal.days.filter((d) => d.date.slice(5, 7) === m);
          return { label: fmtMonth(Number(s.from.slice(0, 4)), i + 1, 'short'), planned: ds.reduce((a, d) => a + d.planned, 0), real: ds.reduce((a, d) => a + d.real, 0) };
        })
      : prDays;
  const classTotal = Object.values(s.classes).reduce((a, b) => a + b, 0);
  const areaRows = s.byArea.filter((a) => a.minutes > 0);
  const sleepRows = s.sleep.days.filter((d) => d.wake || d.bed || d.minutes);
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <StatCard testId="stat-progress" title={t('stats.s1')} empty={s.progress.pct === null} value={s.progress.pct !== null ? `${s.progress.pct}%` : undefined}>
        {s.progress.delta !== null && <p className="text-[15px]">{t(s.progress.delta >= 0 ? 'stats.up' : 'stats.down', { n: Math.abs(s.progress.delta) })}</p>}
      </StatCard>

      <StatCard testId="stat-planned" title={t('stats.s2')} empty={!s.plannedReal.planned && !s.plannedReal.real} value={`${fmtMinutes(s.plannedReal.planned)} · ${fmtMinutes(s.plannedReal.real)}`}>
        <p className="text-[13px] text-muted">
          {t('stats.planned')} · {t('stats.real')}
        </p>
        <div className="h-56" role="img" aria-label={prRows.map((r) => `${r.label}: ${t('stats.planned')} ${fmtMinutes(r.planned)}, ${t('stats.real')} ${fmtMinutes(r.real)}`).join('; ')}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={prRows} margin={{ top: 18, left: -14, right: 4 }}>
              <CartesianGrid stroke="#E7E9F2" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" />
              <YAxis tick={AXIS} />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Bar dataKey="planned" name={t('stats.planned')} fill="var(--c6)" radius={3}>
                {prRows.length <= 12 && <LabelList dataKey="planned" position="top" style={{ fontSize: 13, fill: '#1F2333' }} />}
              </Bar>
              <Bar dataKey="real" name={t('stats.real')} fill="var(--c4)" radius={3}>
                {prRows.length <= 12 && <LabelList dataKey="real" position="top" style={{ fontSize: 13, fill: '#1F2333' }} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </StatCard>

      <StatCard testId="stat-accuracy" title={t('stats.s3')} empty={!s.accuracy.length}>
        <ul className="flex flex-col gap-1 text-[15px]">
          {s.accuracy.map((a) => (
            <li key={a.areaId}>{a.kind === 'ok' ? t('stats.accurate', { area: a.name }) : t(a.kind === 'under' ? 'stats.under' : 'stats.over', { area: a.name, p: a.pct })}</li>
          ))}
        </ul>
      </StatCard>

      <StatCard testId="stat-punctuality" title={t('stats.s4')} empty={!s.punctuality.count} value={s.punctuality.onTimePct !== null ? t('stats.onTimePct', { p: s.punctuality.onTimePct }) : undefined}>
        {s.punctuality.avgLate !== null && <p className="text-[15px]">{t('stats.avgLate', { n: s.punctuality.avgLate })}</p>}
        <p className="text-[13px] text-muted">{t('stats.items', { count: s.punctuality.count })}</p>
      </StatCard>

      <StatCard testId="stat-reliability" title={t('stats.s5')} empty={!s.reliability.count} value={s.reliability.pct !== null ? `${s.reliability.pct}%` : undefined}>
        <p className="text-[13px] text-muted">{t('stats.events', { count: s.reliability.count })}</p>
      </StatCard>

      <StatCard testId="stat-deadlines" title={t('stats.s6')} empty={!s.deadlines.onTime && !s.deadlines.after && !s.deadlines.postponements}>
        <ul className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['onTime', s.deadlines.onTime],
              ['after', s.deadlines.after],
              ['postponements', s.deadlines.postponements],
            ] as const
          ).map(([k, v]) => (
            <li key={k} className="rounded-[8px] bg-primary-soft/40 p-2">
              <p className="text-2xl font-bold">{v}</p>
              <p className="text-[13px]">{t(`stats.dl.${k}`)}</p>
            </li>
          ))}
        </ul>
      </StatCard>

      <StatCard testId="stat-areas" title={t('stats.s7')} empty={!areaRows.length}>
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="h-40 w-40 shrink-0" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={areaRows} dataKey="minutes" nameKey="name" innerRadius="55%" outerRadius="100%" isAnimationActive={false}>
                  {areaRows.map((a) => (
                    <Cell key={String(a.areaId)} fill={a.color ? `var(--c${a.color})` : '#9AA1B1'} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
          <table className="w-full text-[15px]">
            <tbody>
              {areaRows.map((a) => (
                <tr key={String(a.areaId)} className="border-b border-line/60">
                  <td className="py-1">
                    <span className="mr-2 inline-block h-3 w-3 rounded-full" style={{ background: a.color ? `var(--c${a.color})` : '#9AA1B1' }} aria-hidden />
                    {a.name || t('stats.noArea')}
                  </td>
                  <td className="py-1 text-right">{fmtMinutes(a.minutes)}</td>
                  <td className="py-1 text-right font-semibold">{a.pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatCard>

      <StatCard testId="stat-classes" title={t('stats.s8')} empty={!classTotal}>
        <div className="flex h-5 overflow-hidden rounded-full" aria-hidden>
          {(Object.keys(s.classes) as Classification[]).map((k) => s.classes[k] > 0 && <span key={k} style={{ width: `${(s.classes[k] / classTotal) * 100}%`, background: CLASS_COLORS[k] }} />)}
        </div>
        <ul className="grid grid-cols-2 gap-1 text-[15px]">
          {(Object.keys(s.classes) as Classification[]).map((k) => (
            <li key={k} className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: CLASS_COLORS[k] }} aria-hidden />
              {t(`class.${k}`)}: {fmtMinutes(s.classes[k])} ({classTotal ? Math.round((s.classes[k] / classTotal) * 100) : 0}%)
            </li>
          ))}
        </ul>
      </StatCard>

      <StatCard testId="stat-thieves" title={t('stats.s9')} empty={!s.thieves.length}>
        <ol className="flex flex-col gap-1 text-[15px]">
          {s.thieves.map((x, i) => (
            <li key={x.name}>
              {i + 1}. {x.name} · {fmtMinutes(x.minutes)}
            </li>
          ))}
        </ol>
      </StatCard>

      <StatCard testId="stat-energy" title={t('stats.s10')} empty={!s.energy.length}>
        <Heatmap cells={s.energy} />
      </StatCard>

      <StatCard testId="stat-sleep" title={t('stats.s11')} empty={!sleepRows.length} value={s.sleep.avgMinutes !== null ? t('stats.avgSleep', { t: fmtMinutes(s.sleep.avgMinutes) }) : undefined}>
        {s.sleep.wakeSpread !== null && <p className="text-[15px]">{t('stats.wakeSpread', { n: s.sleep.wakeSpread })}</p>}
        <div className="max-h-56 overflow-auto" tabIndex={0} role="region" aria-label={t('stats.s11')}>
          <table className="w-full text-[15px]">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="py-1">{t('common.date')}</th>
                <th className="py-1">{t('stats.wake')}</th>
                <th className="py-1">{t('stats.bed')}</th>
                <th className="py-1 text-right">{t('stats.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {sleepRows.map((d) => (
                <tr key={d.date} className="border-b border-line/60">
                  <td className="py-1">{fmtDate(d.date)}</td>
                  <td className="py-1">{d.wake ? localHHMM(d.wake) : '—'}</td>
                  <td className="py-1">{d.bed ? localHHMM(d.bed) : '—'}</td>
                  <td className="py-1 text-right">{d.minutes !== null ? fmtMinutes(d.minutes) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </StatCard>

      <StatCard testId="stat-feelings" title={t('stats.s12')} empty={!s.feelings.days.length}>
        <div className="h-44" role="img" aria-label={s.feelings.days.map((d) => `${fmtDate(d.date)}: ${d.feeling}`).join('; ')}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={s.feelings.days.map((d) => ({ ...d, label: fmtDate(d.date) }))} margin={{ top: 16, left: -24, right: 8 }}>
              <CartesianGrid stroke="#E7E9F2" />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={AXIS} />
              <Line dataKey="feeling" stroke="var(--primary)" strokeWidth={3} isAnimationActive={false}>
                <LabelList dataKey="feeling" position="top" style={{ fontSize: 13, fill: '#1F2333' }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        </div>
        {s.feelings.goodSleepAvg !== null && <p className="text-[15px]">{t('stats.goodSleep', { t: fmtMinutes(s.feelings.goodSleepAvg) })}</p>}
      </StatCard>

      <StatCard testId="stat-routines" title={t('stats.s13')} empty={!s.routines.length}>
        <ul className="flex flex-col gap-1 text-[15px]">
          {s.routines.map((r) => (
            <li key={r.id}>
              <span className="font-semibold">{r.title}</span>: {t('stats.routineLine', { p: r.stats.pct ?? 0, done: r.stats.done, planned: r.stats.planned, streak: r.stats.streak })}
            </li>
          ))}
        </ul>
      </StatCard>
    </div>
  );
}

export function Heatmap({ cells }: { cells: Stats['energy'] }) {
  const { t } = useTranslation();
  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const bg = (v: number) => (v >= 2.5 ? '#8CE99A' : v >= 1.5 ? '#FFE066' : '#FFA8A8');
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('stats.s10')}>
      <table className="border-separate border-spacing-0.5 text-[13px]">
        <thead>
          <tr>
            <th />
            {hours.map((h) => (
              <th key={h} className="px-1 font-semibold">
                {String(h).padStart(2, '0')}h
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 7].map((w) => (
            <tr key={w}>
              <th className="pr-1 text-left font-semibold">{weekdayName(w, 'short')}</th>
              {hours.map((h) => {
                const c = cells.find((x) => x.weekday === w && x.hour === h);
                return (
                  <td key={h} className="h-8 min-w-9 rounded text-center font-semibold text-ink" style={{ background: c ? bg(c.avg) : '#F7F7FA' }}>
                    {c ? fmtNumber(c.avg) : ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-[13px] text-muted">{t('stats.energyScale')}</p>
    </div>
  );
}

export function StatsView() {
  const { t } = useTranslation();
  const now = useNow(60000);
  const data = useDayData();
  const [kind, setKind] = useState<PeriodKind>('week');
  const [anchor, setAnchor] = useState(dateKey(now));
  const [custom, setCustom] = useState<[DateKey, DateKey]>([addDays(dateKey(now), -13), dateKey(now)]);
  const [from, to] = periodRange(kind, anchor, custom);
  const s = useMemo(() => (data ? computeStats({ raw: data.raw, entries: data.entries, days: data.days, areas: data.areas, now }, from, to) : null), [data, from, to, now]);
  const step = (dir: 1 | -1) => {
    if (kind === 'day') setAnchor(addDays(anchor, dir));
    if (kind === 'week') setAnchor(addDays(anchor, 7 * dir));
    if (kind === 'month') setAnchor(addMonths(monthStart(anchor), dir));
    if (kind === 'year') setAnchor(`${Number(anchor.slice(0, 4)) + dir}-01-01`);
  };
  if (!s) return null;
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label={t('stats.period')}
        value={kind}
        onChange={setKind}
        options={(['day', 'week', 'month', 'year', 'custom'] as PeriodKind[]).map((k) => ({ value: k, label: t(`stats.periods.${k}`) }))}
      />
      {kind === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('stats.from')}>{(id) => <Input id={id} type="date" value={custom[0]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1] < e.target.value ? e.target.value : custom[1]])} />}</Field>
          <Field label={t('stats.to')}>{(id) => <Input id={id} type="date" value={custom[1]} onChange={(e) => e.target.value && setCustom([custom[0] > e.target.value ? e.target.value : custom[0], e.target.value])} />}</Field>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <IconButton label={t('cal.prev')} onClick={() => step(-1)}>
            <ChevronLeft />
          </IconButton>
          <p className="text-base font-bold" data-testid="stats-title">
            {periodTitle(kind, from, to)}
          </p>
          <IconButton label={t('cal.next')} onClick={() => step(1)}>
            <ChevronRight />
          </IconButton>
        </div>
      )}
      <StatsCards s={s} kind={kind} />
    </div>
  );
}
