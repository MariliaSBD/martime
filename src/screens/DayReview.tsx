import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bar as RBar, BarChart, LabelList, ResponsiveContainer, XAxis, YAxis, Legend } from 'recharts';
import { ArrowLeft, Plus } from 'lucide-react';
import { useCreate } from '@/components/CreateMenu';
import { Button, Card, Input, Ring, Segmented, cx } from '@/components/ui';
import { TipView } from '@/components/TipView';
import { activeDayOf, dayItems, useDayData } from './today/useToday';
import { progressOf } from '@/lib/domain/progress';
import { realMinutesOf } from '@/lib/domain/timeEntries';
import { buildTip } from '@/lib/domain/tip';
import { addDays, nowIso, toDate } from '@/lib/time';
import { fmtDate, fmtLongDate, fmtTime } from '@/lib/format';
import { endDay } from '@/state/actions/day';
import { deleteTask, postponeTask } from '@/state/actions/tasks';
import { TaskCard } from '@/components/TaskCard';
import { useNow } from '@/state/data';
import type { Task } from '@/db/types';

type Choice = 'tomorrow' | 'date' | 'someday' | 'delete';

export function PlannedRealChart({ rows }: { rows: { name: string; planned: number; real: number }[] }) {
  const { t } = useTranslation();
  if (!rows.length) return null;
  return (
    <div style={{ height: Math.max(140, rows.length * 56) }} role="img" aria-label={rows.map((r) => `${r.name}: ${t('stats.planned')} ${r.planned} min, ${t('stats.real')} ${r.real} min`).join('; ')}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40 }}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 13, fill: '#1F2333' }} />
          <Legend wrapperStyle={{ fontSize: 13 }} />
          <RBar dataKey="planned" name={t('stats.planned')} fill="var(--c6)" radius={4}>
            <LabelList dataKey="planned" position="right" style={{ fontSize: 13, fill: '#1F2333' }} formatter={(v: unknown) => `${v} min`} />
          </RBar>
          <RBar dataKey="real" name={t('stats.real')} fill="var(--c4)" radius={4}>
            <LabelList dataKey="real" position="right" style={{ fontSize: 13, fill: '#1F2333' }} formatter={(v: unknown) => `${v} min`} />
          </RBar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const STEPS = 6;

export default function DayReview() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { open } = useCreate();
  const [params] = useSearchParams();
  const now = useNow(30000);
  const data = useDayData();
  const [step, setStep] = useState(0);
  const [choices, setChoices] = useState<Record<string, { c: Choice; date?: string }>>({});
  const [feeling, setFeeling] = useState<number | null>(null);
  const endAt = params.get('fim') ?? null;

  // Snapshot when the review opens: moving tasks during the review does not change the result.
  const snap = useMemo(() => {
    if (!data) return null;
    const day = activeDayOf(data.days);
    if (!day) return null;
    const at = endAt ?? nowIso();
    const items = dayItems(data, day.date);
    const progress = progressOf(items);
    const from = day.startedAt;
    const to = at;
    const dayEntries = data.entries.filter((e) => e.source !== 'sleep' && toDate(e.end ?? at) > toDate(from) && toDate(e.start) < toDate(to));
    const tip = buildTip({ date: day.date, pct: progress.pct, items, allTasks: data.raw.filter((x) => !x.deleted_at), entries: data.entries, dayEntries, blocks: data.blocks, areas: data.areas, activeFrom: from, activeTo: to, now: at });
    const rows = items
      .filter((x) => x.kind === 'task')
      .map((x) => ({ name: x.title.length > 18 ? x.title.slice(0, 17) + '…' : x.title, planned: x.plannedMinutes || 30, real: Math.round(realMinutesOf(x, data.entries, at) ?? 0) }));
    const pending = items.filter((x) => x.kind === 'task' && x.status === 'pending');
    return { day, at, progress, tip, rows, pending };
  }, [data === undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;
  if (!snap)
    return (
      <div className="mx-auto max-w-2xl">
        <p className="text-muted">{t('review.noActiveDay')}</p>
        <Button className="mt-3" onClick={() => nav('/hoje')}>
          {t('nav.today')}
        </Button>
      </div>
    );

  const tomorrow = addDays(snap.day.date, 1);
  const tomorrowItems = dayItems(data, tomorrow);
  const choiceOf = (x: Task) => choices[x.id] ?? { c: 'tomorrow' as Choice };

  const finish = async () => {
    for (const x of snap.pending) {
      const ch = choiceOf(x);
      if (ch.c === 'delete') await deleteTask(x.id);
      else await postponeTask(x.id, ch.c === 'tomorrow' ? tomorrow : ch.c === 'someday' ? null : (ch.date ?? tomorrow), 'review');
    }
    await endDay(snap.day.id, snap.at, snap.progress, snap.tip, feeling);
    nav('/hoje');
  };

  const titles = [t('review.s1'), t('review.s2'), t('review.s3'), t('review.s4'), t('review.s5'), t('review.s6')];
  const ctx = { areas: data.areas, places: data.places, entries: data.entries, now };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Button variant="ghost" className="self-start" onClick={() => nav('/hoje')}>
        <ArrowLeft size={18} aria-hidden />
        {t('common.back')}
      </Button>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label={t('onboarding.progress', { n: step + 1, total: STEPS })} className="flex gap-1.5">
        {titles.map((_, i) => (
          <span key={i} className={cx('h-2 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-line')} />
        ))}
      </div>
      <p className="text-[15px] font-semibold text-muted-bg">
        {t('onboarding.progress', { n: step + 1, total: STEPS })} · {fmtLongDate(snap.day.date)}
      </p>
      <h1 className="text-2xl font-bold">{titles[step]}</h1>

      <Card className="flex flex-col gap-4">
        {step === 0 && (
          <>
            <div className="flex items-center gap-4">
              <Ring pct={snap.progress.pct} label={snap.progress.pct === null ? t('today.noData') : t('today.progressLabel', { p: snap.progress.pct })} />
            </div>
            <PlannedRealChart rows={snap.rows} />
          </>
        )}
        {step === 1 &&
          (snap.pending.length ? (
            <ul className="flex flex-col gap-3">
              {snap.pending.map((x) => {
                const ch = choiceOf(x);
                return (
                  <li key={x.id} className="flex flex-col gap-2 rounded-[8px] border border-line p-3" data-testid="review-pending">
                    <p className="text-base font-semibold">{x.title}</p>
                    <Segmented
                      label={t('review.whatTo', { name: x.title })}
                      value={ch.c}
                      onChange={(c) => setChoices({ ...choices, [x.id]: { c, date: ch.date ?? addDays(tomorrow, 1) } })}
                      options={[
                        { value: 'tomorrow', label: t('common.tomorrow') },
                        { value: 'date', label: t('common.otherDate') },
                        { value: 'someday', label: t('common.someday') },
                        { value: 'delete', label: t('common.delete') },
                      ]}
                    />
                    {ch.c === 'date' && <Input type="date" aria-label={t('common.date')} value={ch.date ?? ''} onChange={(e) => setChoices({ ...choices, [x.id]: { c: 'date', date: e.target.value || tomorrow } })} />}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-base text-muted">{t('review.allDone')}</p>
          ))}
        {step === 2 && (
          <div role="radiogroup" aria-label={t('review.s3')} className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={feeling === n} onClick={() => setFeeling(n)} className={cx('min-h-14 rounded-[8px] border text-xl font-bold', feeling === n ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line')}>
                {n}
              </button>
            ))}
          </div>
        )}
        {step === 3 && <TipView tip={snap.tip} />}
        {step === 4 && (
          <>
            <p className="text-base font-semibold">{fmtDate(tomorrow, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            {tomorrowItems.length ? (
              <ul className="flex flex-col gap-2">
                {tomorrowItems.map((x) => (
                  <li key={x.id}>
                    <TaskCard task={x} ctx={ctx} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">{t('today.empty')}</p>
            )}
            <Button variant="soft" className="self-start" onClick={() => open(undefined, { date: tomorrow })}>
              <Plus size={18} aria-hidden />
              {t('common.add')}
            </Button>
          </>
        )}
        {step === 5 && <p className="text-base">{t('review.endAt', { t: fmtTime(snap.at) })}</p>}
      </Card>

      <div className="flex justify-between gap-2">
        {step > 0 ? <Button onClick={() => setStep(step - 1)}>{t('common.back')}</Button> : <span />}
        <div className="flex gap-2">
          {step === 2 && (
            <Button onClick={() => (setFeeling(null), setStep(3))}>{t('common.skip')}</Button>
          )}
          {step < STEPS - 1 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              {t('common.next')}
            </Button>
          ) : (
            <Button variant="primary" onClick={finish}>
              {t('today.endDay')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
