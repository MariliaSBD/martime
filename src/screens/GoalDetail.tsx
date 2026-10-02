import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { Goal } from '@/db/types';
import { remove, undoable, update, uuid } from '@/db/repo';
import { useCreate } from '@/components/CreateMenu';
import { AutoInput, Button, Card, Field, IconButton, Input, ItemMenu, Ring, Segmented, Sheet, TextArea, Toggle, useToast } from '@/components/ui';
import { TaskCard } from '@/components/TaskCard';
import { biggestSource, contributions, goalProgress, series } from '@/lib/domain/goals';
import { dateKey, nowIso } from '@/lib/time';
import { fmtDate, fmtNumber, onWeekdays } from '@/lib/format';
import { useGoalContext, paceText } from './Goals';
import { useDayData } from './today/useToday';
import { useNow } from '@/state/data';

const STATUSES: Goal['status'][] = ['active', 'done', 'paused', 'abandoned'];

function StatusSheet({ goal, to, onClose }: { goal: Goal; to: Goal['status']; onClose: () => void }) {
  const { t } = useTranslation();
  const [why, setWhy] = useState('');
  const [learned, setLearned] = useState('');
  const [tried, setTried] = useState(false);
  const needLearned = to === 'abandoned';
  return (
    <Sheet
      open
      onClose={onClose}
      title={t(`goals.status.${to}`)}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={async () => {
              setTried(true);
              if (needLearned && !learned.trim()) return;
              await update('goals', goal.id, { status: to, statusWhy: why, learned });
              onClose();
            }}
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('goals.whyStatus')}>{(id) => <TextArea id={id} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field>
        <Field label={t('goals.learned')} error={tried && needLearned && !learned.trim() ? t('common.required') : null}>
          {(id, d) => <TextArea id={id} aria-describedby={d} value={learned} onChange={(e) => setLearned(e.target.value)} />}
        </Field>
      </div>
    </Sheet>
  );
}

export default function GoalDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const { open } = useCreate();
  const now = useNow(60000);
  const ctx = useGoalContext();
  const data = useDayData();
  const [statusTo, setStatusTo] = useState<Goal['status'] | null>(null);
  const [manual, setManual] = useState({ date: dateKey(nowIso()), value: '' });
  const [newReview, setNewReview] = useState('');
  if (!ctx || !data) return null;
  const goal = ctx.goals.find((g) => g.id === id);
  if (!goal) return null;
  const c = { ...ctx, now };
  const p = goalProgress(goal, c);
  const pts = series(goal, c).map((x) => ({ ...x, label: fmtDate(x.date) }));
  const cs = contributions(goal, c);
  const best = biggestSource(cs);
  const steps = ctx.tasks.filter((x) => x.goalId === goal.id && !x.repeat).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'));
  const children = ctx.goals.filter((g) => g.parentId === goal.id);
  const routine = goal.routineId ? ctx.tasks.find((x) => x.id === goal.routineId) : null;
  const set = (patch: Partial<Goal>) => update('goals', goal.id, patch);
  const cardCtx = { areas: data.areas, places: data.places, entries: data.entries, now };
  const today = dateKey(now);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(-1)}>
          <ArrowLeft size={18} aria-hidden />
          {t('common.back')}
        </Button>
        <ItemMenu
          items={[
            {
              label: t('common.delete'),
              danger: true,
              onSelect: async () => {
                const { undo } = await undoable(async () => {
                  await remove('goals', goal.id);
                });
                toast(t('common.deleted'), undo);
                nav('/objetivos');
              },
            },
          ]}
        />
      </div>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Ring pct={p.pct} label={t('goals.progressLabel', { p: p.pct })} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">{goal.what}</h1>
          <p className="text-[15px]">
            {fmtNumber(p.value)} / {fmtNumber(p.target)} {goal.unit} · {t('goals.untilShort', { d: fmtDate(goal.dueDate) })}
          </p>
          {goal.status === 'active' && <p className="text-[15px] font-semibold" data-testid="pace">{paceText(goal, c, t)}</p>}
        </div>
      </Card>

      {p.pct >= 100 && goal.status === 'active' && (
        <Card className="border-l-4 border-success">
          <p className="mb-2 font-semibold">{t('goals.reached')}</p>
          <Button variant="primary" onClick={() => set({ status: 'done', completedAt: nowIso() })}>
            {t('goals.markDone')}
          </Button>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('goals.chart')}</h2>
        <div className="h-56" role="img" aria-label={t('goals.chartLabel', { v: fmtNumber(p.value), t: fmtNumber(p.target) })}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pts} margin={{ left: -10, right: 10, top: 10 }}>
              <CartesianGrid stroke="#E7E9F2" />
              <XAxis dataKey="label" tick={{ fontSize: 13, fill: '#1F2333' }} minTickGap={24} />
              <YAxis tick={{ fontSize: 13, fill: '#1F2333' }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 13 }} />
              <Line dataKey="expected" name={t('goals.expected')} stroke="#6B7280" strokeDasharray="6 4" dot={false} isAnimationActive={false} />
              <Line dataKey="value" name={t('goals.actual')} stroke="var(--primary)" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {goal.type === 'number' && goal.source === 'manual' && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t('goals.logValue')}</h2>
          <form
            className="grid grid-cols-[1fr_1fr_auto] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (manual.value === '') return;
              void set({ manualLog: [...goal.manualLog.filter((m) => m.date !== manual.date), { date: manual.date, value: Number(manual.value) }] });
              setManual({ ...manual, value: '' });
            }}
          >
            <Input type="date" aria-label={t('common.date')} value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />
            <Input type="number" inputMode="decimal" aria-label={t('goals.currentValue')} placeholder={t('goals.currentValue')} value={manual.value} onChange={(e) => setManual({ ...manual, value: e.target.value })} />
            <Button type="submit" variant="soft">
              {t('common.add')}
            </Button>
          </form>
        </Card>
      )}
      {goal.type === 'complete' && !steps.length && !children.length && (
        <Card>
          <Toggle label={t('goals.manualDone')} checked={goal.manualDone} onChange={(v) => set({ manualDone: v })} />
        </Card>
      )}
      {routine && (
        <Card>
          <p className="text-[15px]">
            {t('goals.routine')}: <span className="font-semibold">{routine.title}</span> · {t('goals.freqText', { n: goal.freqN, per: t(goal.freqPer === 'week' ? 'goals.perWeek' : 'goals.perMonth') })}
          </p>
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('goals.plan')}</h2>
          <Button variant="soft" onClick={() => open('task', { goalId: goal.id, date: today })}>
            <Plus size={18} aria-hidden />
            {t('goals.addStep')}
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.id}>
              <TaskCard task={s} ctx={cardCtx} showDate />
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('goals.children')}</h2>
          <Button variant="soft" onClick={() => open('goal', { parentGoalId: goal.id })}>
            <Plus size={18} aria-hidden />
            {t('goals.addChild')}
          </Button>
        </div>
        <ul className="flex flex-col gap-2">
          {children.map((g) => {
            const cp = goalProgress(g, c);
            return (
              <li key={g.id}>
                <button type="button" onClick={() => nav(`/objetivo/${g.id}`)} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[8px] border border-line px-3 text-left">
                  <span className="font-semibold">{g.what}</span>
                  <span className="text-[13px]">
                    {cp.pct}% · {t(`goals.status.${g.status}`)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{t('goals.path')}</h2>
        {best && <p className="text-[15px] font-semibold" data-testid="path-summary">{t('goals.pathSummary', { p: best.pct, what: best.label, when: onWeekdays(best.weekday) })}</p>}
        {cs.length ? (
          <ol className="flex flex-col gap-1 border-l-2 border-primary-soft pl-3" data-testid="path">
            {[...cs].reverse().map((x, i) => (
              <li key={i} className="text-[15px]">
                <span className="font-semibold">{fmtDate(x.date)}</span> · {x.label || t('goals.manualEntry')} · {x.amount > 0 ? '+' : ''}
                {fmtNumber(x.amount)} {goal.unit}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">{t('common.notEnoughData')}</p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('goals.reviews')}</h2>
        <ul className="flex flex-col gap-3">
          {[...goal.reviews]
            .sort((a, b) => (a.date < b.date ? -1 : 1))
            .map((r) => {
              const at = r.date <= today ? goalProgress(goal, c, r.date) : null;
              return (
                <li key={r.id} className="flex flex-col gap-2 rounded-[8px] border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">
                      {fmtDate(r.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                      {at && ` · ${at.pct}%`}
                    </span>
                    <IconButton label={t('common.delete')} onClick={() => set({ reviews: goal.reviews.filter((x) => x.id !== r.id) })}>
                      <Trash2 size={18} />
                    </IconButton>
                  </div>
                  {r.date <= today && (
                    <>
                      <Field label={t('goals.howAmI')}>{(fid) => <AutoInput id={fid} multiline value={r.how} onSave={(v) => set({ reviews: goal.reviews.map((x) => (x.id === r.id ? { ...x, how: v, progress: at?.pct ?? null } : x)) })} />}</Field>
                      <Field label={t('goals.adjust')}>{(fid) => <AutoInput id={fid} multiline value={r.adjust} onSave={(v) => set({ reviews: goal.reviews.map((x) => (x.id === r.id ? { ...x, adjust: v, progress: at?.pct ?? null } : x)) })} />}</Field>
                    </>
                  )}
                </li>
              );
            })}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newReview) return;
            void set({ reviews: [...goal.reviews, { id: uuid(), date: newReview, progress: null, how: '', adjust: '' }] });
            setNewReview('');
          }}
        >
          <Input type="date" aria-label={t('goals.reviewDate')} value={newReview} onChange={(e) => setNewReview(e.target.value)} />
          <Button type="submit" variant="soft">
            <Plus size={18} aria-hidden />
            {t('common.add')}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('goals.priority')}</h2>
        <Toggle
          label={t('goals.main')}
          checked={goal.isMain}
          onChange={async (v) => {
            if (v) for (const g of ctx.goals) if (g.isMain && g.id !== goal.id) await update('goals', g.id, { isMain: false });
            await set({ isMain: v });
          }}
        />
        {goal.isMain && <Field label={t('goals.mainWhy')}>{(fid) => <AutoInput id={fid} multiline value={goal.mainWhy} onSave={(v) => set({ mainWhy: v })} />}</Field>}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('detail.status')}</h2>
        <Segmented
          label={t('detail.status')}
          value={goal.status}
          onChange={(s) => {
            if (s === 'paused' || s === 'abandoned') setStatusTo(s);
            else void set({ status: s, completedAt: s === 'done' ? nowIso() : null });
          }}
          options={STATUSES.map((s) => ({ value: s, label: t(`goals.status.${s}`) }))}
        />
        {(goal.statusWhy || goal.learned) && (
          <div className="text-[15px]">
            {goal.statusWhy && (
              <p>
                <span className="font-semibold">{t('goals.whyStatus')}</span> {goal.statusWhy}
              </p>
            )}
            {goal.learned && (
              <p>
                <span className="font-semibold">{t('goals.learned')}</span> {goal.learned}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="flex flex-col gap-4">
        <Field label={t('goals.what')}>{(fid) => <AutoInput id={fid} multiline value={goal.what} onSave={(v) => v.trim() && set({ what: v.trim() })} />}</Field>
        <Field label={t('goals.measure')}>{(fid) => <AutoInput id={fid} multiline value={goal.measure} onSave={(v) => set({ measure: v })} />}</Field>
        <Field label={t('goals.realistic')}>{(fid) => <AutoInput id={fid} multiline value={goal.realistic} onSave={(v) => set({ realistic: v })} />}</Field>
        <Field label={t('goals.why')}>{(fid) => <AutoInput id={fid} multiline value={goal.why} onSave={(v) => set({ why: v })} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('goals.start')}>{(fid) => <Input id={fid} type="date" value={goal.startDate} onChange={(e) => e.target.value && e.target.value <= goal.dueDate && set({ startDate: e.target.value })} />}</Field>
          <Field label={t('goals.until')}>{(fid) => <Input id={fid} type="date" value={goal.dueDate} onChange={(e) => e.target.value && e.target.value >= goal.startDate && set({ dueDate: e.target.value })} />}</Field>
        </div>
        {goal.type === 'number' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('goals.target')}>{(fid) => <AutoInput id={fid} type="number" value={String(goal.target)} onSave={(v) => Number(v) > 0 && set({ target: Number(v) })} />}</Field>
            <Field label={t('goals.unit')}>{(fid) => <AutoInput id={fid} value={goal.unit} onSave={(v) => set({ unit: v })} />}</Field>
          </div>
        )}
      </Card>
      {statusTo && <StatusSheet goal={goal} to={statusTo} onClose={() => setStatusTo(null)} />}
    </div>
  );
}
