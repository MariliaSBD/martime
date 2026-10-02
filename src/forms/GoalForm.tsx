import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import type { CreateFormProps } from '@/components/CreateMenu';
import { Button, Field, Input, RadioCards, Select, Sheet, TextArea } from '@/components/ui';
import { AreaSelect } from '@/components/fields';
import { create, uuid } from '@/db/repo';
import { db } from '@/db/db';
import type { Goal } from '@/db/types';
import { useSettings } from '@/state/app';
import { useAreas } from '@/state/data';
import { defaultReviewDates, horizonDue } from '@/lib/domain/goals';
import { isSeries } from '@/lib/domain/recurrence';
import { createTask } from '@/state/actions/tasks';
import { dateKey, nowIso } from '@/lib/time';

const HORIZONS: Goal['horizon'][] = ['week', 'month', 'quarter', 'year'];

export function GoalForm({ prefill, onDone, onCancel }: CreateFormProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const s = useSettings();
  const areas = useAreas() ?? [];
  const goals = useLiveQuery(async () => (await db.goals.toArray()).filter((g) => !g.deleted_at), []) ?? [];
  const routines = useLiveQuery(async () => (await db.tasks.toArray()).filter((x) => !x.deleted_at && isSeries(x)), []) ?? [];
  const today = dateKey(nowIso());
  const [f, setF] = useState({
    what: '',
    measure: '',
    realistic: '',
    why: '',
    dueDate: horizonDue(today, 'month'),
    areaId: '',
    horizon: 'month' as Goal['horizon'],
    startDate: today,
    parentId: prefill.parentGoalId ?? '',
    type: 'number' as Goal['type'],
    target: '10',
    unit: '',
    source: 'tasks' as Goal['source'],
    routineId: '',
    newRoutine: '',
    freqN: '3',
    freqPer: 'week' as Goal['freqPer'],
  });
  const [tried, setTried] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const areaId = f.areaId || s.lastAreaId || areas[0]?.id || '';
  const err = {
    what: tried && !f.what.trim() ? t('common.required') : null,
    due: tried && (!f.dueDate || f.dueDate < f.startDate) ? t('goals.dueAfterStart') : null,
    target: tried && f.type === 'number' && !(Number(f.target) > 0) ? t('goals.targetPositive') : null,
    routine: tried && f.type === 'frequency' && !f.routineId && !f.newRoutine.trim() ? t('common.required') : null,
  };

  const submit = async () => {
    setTried(true);
    if (!f.what.trim() || !f.dueDate || f.dueDate < f.startDate) return;
    if (f.type === 'number' && !(Number(f.target) > 0)) return;
    if (f.type === 'frequency' && !f.routineId && !f.newRoutine.trim()) return;
    let routineId = f.routineId || null;
    if (f.type === 'frequency' && !routineId) routineId = (await createTask({ title: f.newRoutine.trim(), areaId, date: f.startDate, repeat: { freq: 'daily' } })).id;
    const order = goals.length ? Math.max(...goals.map((g) => g.order)) + 1 : 0;
    const g = await create('goals', {
      what: f.what.trim(),
      measure: f.measure,
      realistic: f.realistic,
      why: f.why,
      dueDate: f.dueDate,
      areaId,
      horizon: f.horizon,
      startDate: f.startDate,
      parentId: f.parentId || null,
      type: f.type,
      target: f.type === 'number' ? Number(f.target) : 0,
      unit: f.type === 'number' ? (f.source === 'hours' ? t('goals.hoursUnit') : f.unit) : '',
      source: f.source,
      manualLog: [],
      manualDone: false,
      routineId,
      freqN: Math.max(1, Number(f.freqN) || 1),
      freqPer: f.freqPer,
      status: 'active',
      statusWhy: '',
      learned: '',
      order,
      isMain: false,
      mainWhy: '',
      reviews: defaultReviewDates(f.startDate, f.dueDate).map((date) => ({ id: uuid(), date, progress: null, how: '', adjust: '' })),
      completedAt: null,
    });
    onDone(g.id);
    nav(`/objetivo/${g.id}`);
  };

  return (
    <Sheet
      open
      onClose={onCancel}
      wide
      title={t('create.goal')}
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" className="flex-1" onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('goals.what')} error={err.what}>
          {(id, d) => <TextArea id={id} aria-describedby={d} aria-invalid={!!err.what} placeholder={t('goals.whatPh')} value={f.what} onChange={(e) => set({ what: e.target.value })} />}
        </Field>
        <Field label={t('goals.measure')}>{(id) => <TextArea id={id} placeholder={t('goals.measurePh')} value={f.measure} onChange={(e) => set({ measure: e.target.value })} />}</Field>
        <Field label={t('goals.realistic')}>{(id) => <TextArea id={id} placeholder={t('goals.realisticPh')} value={f.realistic} onChange={(e) => set({ realistic: e.target.value })} />}</Field>
        <Field label={t('goals.why')}>{(id) => <TextArea id={id} placeholder={t('goals.whyPh')} value={f.why} onChange={(e) => set({ why: e.target.value })} />}</Field>
        <Field label={t('goals.horizon')}>
          {() => (
            <RadioCards
              label={t('goals.horizon')}
              columns={4}
              value={f.horizon}
              onChange={(h) => set({ horizon: h, dueDate: horizonDue(f.startDate, h) })}
              options={HORIZONS.map((h) => ({ value: h, label: t(`goals.horizons.${h}`) }))}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('goals.start')}>{(id) => <Input id={id} type="date" value={f.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />}</Field>
          <Field label={t('goals.until')} error={err.due}>
            {(id, d) => <Input id={id} type="date" aria-describedby={d} value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />}
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={t('common.area')}>{(id) => <AreaSelect id={id} value={areaId} onChange={(v) => set({ areaId: v })} />}</Field>
          <Field label={t('goals.parent')}>{(id) => <Select id={id} value={f.parentId} onChange={(e) => set({ parentId: e.target.value })} options={[{ value: '', label: t('common.none') }, ...goals.map((g) => ({ value: g.id, label: g.what }))]} />}</Field>
        </div>
        <Field label={t('goals.type')}>
          {() => <RadioCards label={t('goals.type')} value={f.type} onChange={(v) => set({ type: v })} options={(['number', 'complete', 'frequency'] as const).map((v) => ({ value: v, label: t(`goals.types.${v}`) }))} />}
        </Field>
        {f.type === 'number' && (
          <>
            <Field label={t('goals.source')}>
              {(id) => <Select id={id} value={f.source} onChange={(e) => set({ source: e.target.value as Goal['source'] })} options={(['tasks', 'hours', 'manual'] as const).map((v) => ({ value: v, label: t(`goals.sources.${v}`) }))} />}
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('goals.target')} error={err.target}>
                {(id, d) => <Input id={id} aria-describedby={d} type="number" inputMode="decimal" min={0} value={f.target} onChange={(e) => set({ target: e.target.value })} />}
              </Field>
              {f.source !== 'hours' && <Field label={t('goals.unit')}>{(id) => <Input id={id} placeholder={t('goals.unitPh')} value={f.unit} onChange={(e) => set({ unit: e.target.value })} />}</Field>}
            </div>
          </>
        )}
        {f.type === 'frequency' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('goals.freqN')}>{(id) => <Input id={id} type="number" min={1} value={f.freqN} onChange={(e) => set({ freqN: e.target.value })} />}</Field>
              <Field label={t('goals.freqPer')}>
                {(id) => <Select id={id} value={f.freqPer} onChange={(e) => set({ freqPer: e.target.value as Goal['freqPer'] })} options={[{ value: 'week', label: t('goals.perWeek') }, { value: 'month', label: t('goals.perMonth') }]} />}
              </Field>
            </div>
            <Field label={t('goals.routine')} error={err.routine}>
              {(id, d) => <Select id={id} aria-describedby={d} value={f.routineId} onChange={(e) => set({ routineId: e.target.value })} options={[{ value: '', label: t('goals.newRoutine') }, ...routines.map((r) => ({ value: r.id, label: r.title }))]} />}
            </Field>
            {!f.routineId && <Field label={t('goals.newRoutineName')}>{(id) => <Input id={id} placeholder={t('goals.routinePh')} value={f.newRoutine} onChange={(e) => set({ newRoutine: e.target.value })} />}</Field>}
          </>
        )}
      </div>
    </Sheet>
  );
}
