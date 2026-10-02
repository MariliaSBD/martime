import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/db';
import { create, update } from '@/db/repo';
import type { WeeklyReview } from '@/db/types';
import { AutoInput, Button, Card, Field } from '@/components/ui';
import { computeStats, type Stats } from '@/lib/domain/stats';
import { addDays, atLocal, toDate, type DateKey } from '@/lib/time';
import { fmtDate, fmtMinutes } from '@/lib/format';
import { useDayData, dayProgress, type DayData } from './today/useToday';
import { useNow } from '@/state/data';

/** 11.3: a week's review is available from Sunday 18:00. */
export function weekAvailable(ws: DateKey, now: string): boolean {
  return toDate(now).getTime() >= atLocal(addDays(ws, 6), '18:00').getTime();
}

export interface WeekSummary {
  stats: Stats;
  best: { date: DateKey; pct: number } | null;
  worst: { date: DateKey; pct: number } | null;
}

export function weekSummary(data: DayData, ws: DateKey, now: string): WeekSummary {
  const stats = computeStats({ raw: data.raw, entries: data.entries, days: data.days, areas: data.areas, now }, ws, addDays(ws, 6));
  const pcts = Array.from({ length: 7 }, (_, i) => addDays(ws, i))
    .map((d) => ({ date: d, pct: dayProgress(data, d).pct }))
    .filter((x): x is { date: DateKey; pct: number } => x.pct !== null);
  const sorted = [...pcts].sort((a, b) => b.pct - a.pct);
  return { stats, best: sorted[0] ?? null, worst: sorted.length > 1 ? sorted[sorted.length - 1] : null };
}

export function WeekSummaryView({ sum }: { sum: WeekSummary }) {
  const { t } = useTranslation();
  const s = sum.stats;
  return (
    <ul className="grid grid-cols-1 gap-2 text-[15px] sm:grid-cols-2" data-testid="week-summary">
      <li>
        <span className="font-semibold">{t('stats.s1')}:</span> {s.progress.pct !== null ? `${s.progress.pct}%` : t('common.noData')}
      </li>
      <li>
        <span className="font-semibold">{t('stats.s2')}:</span> {fmtMinutes(s.plannedReal.planned)} · {fmtMinutes(s.plannedReal.real)}
      </li>
      <li>
        <span className="font-semibold">{t('weeks.topAreas')}:</span> {s.byArea.slice(0, 3).map((a) => `${a.name || t('stats.noArea')} (${fmtMinutes(a.minutes)})`).join(', ') || t('common.noData')}
      </li>
      <li>
        <span className="font-semibold">{t('stats.s4')}:</span> {s.punctuality.onTimePct !== null ? t('stats.onTimePct', { p: s.punctuality.onTimePct }) : t('common.noData')}
      </li>
      <li>
        <span className="font-semibold">{t('weeks.best')}:</span> {sum.best ? `${fmtDate(sum.best.date, { weekday: 'long' })} (${sum.best.pct}%)` : t('common.noData')}
      </li>
      <li>
        <span className="font-semibold">{t('weeks.worst')}:</span> {sum.worst ? `${fmtDate(sum.worst.date, { weekday: 'long' })} (${sum.worst.pct}%)` : t('common.noData')}
      </li>
      <li className="sm:col-span-2">
        <span className="font-semibold">{t('stats.s9')}:</span> {s.thieves.map((x) => `${x.name} (${fmtMinutes(x.minutes)})`).join(', ') || t('common.noData')}
      </li>
    </ul>
  );
}

export const QUESTIONS: ('q1' | 'q2' | 'q3')[] = ['q1', 'q2', 'q3'];

export default function WeekReview() {
  const { week = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const now = useNow(60000);
  const data = useDayData();
  const rec = useLiveQuery(async () => (await db.weeklyReviews.where('weekStart').equals(week).toArray()).find((x) => !x.deleted_at) ?? null, [week]);
  if (!data || rec === undefined) return null;
  const sum = weekSummary(data, week, now);
  const save = async (k: keyof WeeklyReview, v: string) => {
    if (rec) await update('weeklyReviews', rec.id, { [k]: v });
    else await create('weeklyReviews', { weekStart: week, q1: '', q2: '', q3: '', [k]: v });
  };
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Button variant="ghost" className="self-start" onClick={() => nav(-1)}>
        <ArrowLeft size={18} aria-hidden />
        {t('common.back')}
      </Button>
      <h1 className="text-2xl font-bold">{t('weeks.title', { from: fmtDate(week), to: fmtDate(addDays(week, 6)) })}</h1>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('weeks.summary')}</h2>
        <WeekSummaryView sum={sum} />
      </Card>
      <Card className="flex flex-col gap-4">
        {QUESTIONS.map((q) => (
          <Field key={q} label={t(`weeks.${q}`)}>
            {(id) => <AutoInput id={id} multiline value={rec?.[q] ?? ''} onSave={(v) => save(q, v)} />}
          </Field>
        ))}
      </Card>
    </div>
  );
}
