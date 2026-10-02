import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { create, undoable, update, uuid } from '@/db/repo';
import type { ReorgItem, Reorganization } from '@/db/types';
import { AutoInput, Button, Card, Field, IconButton, Input, PageTitle, Select, TextArea, cx, useToast } from '@/components/ui';
import { useDayData, activeDayOf, dayItems } from './today/useToday';
import { useNow } from '@/state/data';
import { useSettings } from '@/state/app';
import { availableMinutes } from '@/lib/domain/misc';
import { realMinutesOf } from '@/lib/domain/timeEntries';
import { addDays, dateKey, minutesBetween } from '@/lib/time';
import { fmtDate, fmtMinutes } from '@/lib/format';
import { ensureReal } from '@/state/actions/tasks';
import { postpone } from '@/lib/domain/deadlines';
import { stamp } from '@/db/repo';

const DECISIONS: ReorgItem['decision'][] = ['do', 'postpone', 'delegate', 'refuse'];
const SIM_TYPES: ReorgItem['itemType'][] = ['call', 'colleague', 'deadline', 'email', 'other'];

export function usedMinutes(items: ReorgItem[]): number {
  return items.filter((i) => i.decision === 'do').reduce((s, i) => s + (i.minutes || 0), 0);
}

function Row({ item, onChange, onRemove, simulation, tomorrow, fixed }: { item: ReorgItem; onChange: (p: Partial<ReorgItem>) => void; onRemove?: () => void; simulation: boolean; tomorrow: string; fixed?: boolean }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: item.id, disabled: item.decision !== 'do' || fixed });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="rounded-[12px] border border-line bg-card p-3" data-testid="reorg-item">
      <div className="flex items-center gap-2">
        {item.decision === 'do' && !fixed && (
          <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={t('today.move', { name: item.title })} className="flex h-11 w-6 cursor-grab touch-none items-center justify-center text-[#9AA1B1]">
            <GripVertical size={18} aria-hidden />
          </button>
        )}
        {simulation ? <AutoInput aria-label={t('fields.title')} placeholder={t('reorg.itemPh')} value={item.title} onSave={(v) => onChange({ title: v })} /> : <span className="flex-1 text-base font-semibold">{item.title}</span>}
        {item.itemType === 'event' && <span className="text-[13px] text-muted">{t('create.event')}</span>}
        {onRemove && (
          <IconButton label={t('common.delete')} onClick={onRemove}>
            <Trash2 size={18} />
          </IconButton>
        )}
      </div>
      {simulation && (
        <div className="mt-2">
          <Select aria-label={t('reorg.type')} value={item.itemType} onChange={(e) => onChange({ itemType: e.target.value as ReorgItem['itemType'] })} options={SIM_TYPES.map((x) => ({ value: x, label: t(`reorg.types.${x}`) }))} />
        </div>
      )}
      {!fixed && (
        <div role="radiogroup" aria-label={t('reorg.decisionFor', { name: item.title })} className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
          {DECISIONS.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={item.decision === d} onClick={() => onChange({ decision: d, postponeTo: d === 'postpone' ? (item.postponeTo ?? tomorrow) : item.postponeTo })} className={cx('min-h-11 rounded-[8px] border text-[15px] font-semibold', item.decision === d ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line')}>
              {t(`reorg.d.${d}`)}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(item.decision === 'do' || fixed) && <Field label={t('reorg.minutes')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={String(item.minutes)} disabled={fixed} onChange={(e) => onChange({ minutes: Math.max(0, Number(e.target.value) || 0) })} />}</Field>}
        {item.decision === 'postpone' && !fixed && (
          <>
            <Field label={t('reorg.to')}>
              {(id) => (
                <Select id={id} value={item.postponeTo === tomorrow ? 'tomorrow' : 'date'} onChange={(e) => onChange({ postponeTo: e.target.value === 'tomorrow' ? tomorrow : addDays(tomorrow, 1) })} options={[{ value: 'tomorrow', label: t('common.tomorrow') }, { value: 'date', label: t('common.otherDate') }]} />
              )}
            </Field>
            {item.postponeTo !== tomorrow && <Field label={t('common.date')}>{(id) => <Input id={id} type="date" value={item.postponeTo ?? ''} onChange={(e) => onChange({ postponeTo: e.target.value || tomorrow })} />}</Field>}
          </>
        )}
        {item.decision === 'delegate' && !fixed && (
          <>
            <Field label={t('detail.delegatedTo')}>{(id) => <Input id={id} placeholder={t('detail.delegatedToPh')} value={item.delegateTo} onChange={(e) => onChange({ delegateTo: e.target.value })} />}</Field>
            <Field label={t('detail.followUp')}>{(id) => <Input id={id} type="date" value={item.followUp ?? ''} onChange={(e) => onChange({ followUp: e.target.value || null })} />}</Field>
          </>
        )}
      </div>
    </li>
  );
}

function Editor({ kind, initial, date, defaultAvailable, onApply, applyLabel }: { kind: 'real' | 'simulation'; initial: { items: ReorgItem[]; fixed: ReorgItem[]; available: number; criteria: string; feedback: string }; date: string; defaultAvailable: number; onApply: (v: { items: ReorgItem[]; available: number; criteria: string; feedback: string }) => Promise<void>; applyLabel: string }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(initial.items);
  const [available, setAvailable] = useState(String(initial.available || defaultAvailable));
  const [criteria, setCriteria] = useState(initial.criteria);
  const [feedback, setFeedback] = useState(initial.feedback);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const used = usedMinutes(items) + initial.fixed.reduce((s, i) => s + i.minutes, 0);
  const avail = Number(available) || 0;
  const over = used > avail;
  const tomorrow = addDays(date, 1);
  const ordered = [...items].sort((a, b) => (a.decision === 'do' ? 0 : 1) - (b.decision === 'do' ? 0 : 1) || a.order - b.order);
  const onEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = ordered.map((x) => x.id);
    const next = arrayMove(ordered, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    setItems(next.map((x, i) => ({ ...x, order: i })));
  };
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-wrap items-end gap-4">
        <Field label={t('reorg.available')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={available} onChange={(e) => setAvailable(e.target.value)} className="w-32" />}</Field>
        <p className={cx('pb-2 text-lg font-bold', over ? 'text-warning-dark' : 'text-ink')} data-testid="reorg-counter" aria-live="polite">
          {t('reorg.counter', { used: fmtMinutes(used), avail: fmtMinutes(avail) })}
        </p>
      </Card>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
        <SortableContext items={ordered.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {initial.fixed.map((x) => (
              <Row key={x.id} item={x} fixed simulation={false} tomorrow={tomorrow} onChange={() => undefined} />
            ))}
            {ordered.map((x) => (
              <Row key={x.id} item={x} simulation={kind === 'simulation'} tomorrow={tomorrow} onChange={(p) => setItems(items.map((y) => (y.id === x.id ? { ...y, ...p } : y)))} onRemove={kind === 'simulation' ? () => setItems(items.filter((y) => y.id !== x.id)) : undefined} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {kind === 'simulation' && (
        <Button variant="soft" className="self-start" onClick={() => setItems([...items, { id: uuid(), taskId: null, title: '', itemType: 'other', minutes: 30, decision: 'do', order: items.length, postponeTo: null, delegateTo: '', followUp: null }])}>
          <Plus size={18} aria-hidden />
          {t('reorg.addItem')}
        </Button>
      )}
      <Field label={t('reorg.criteria')}>{(id) => <TextArea id={id} placeholder={t('reorg.criteriaPh')} value={criteria} onChange={(e) => setCriteria(e.target.value)} />}</Field>
      {kind === 'simulation' && <Field label={t('reorg.feedback')}>{(id) => <TextArea id={id} value={feedback} onChange={(e) => setFeedback(e.target.value)} />}</Field>}
      <Button variant="primary" onClick={() => onApply({ items: items.filter((x) => x.title.trim()), available: avail, criteria, feedback })}>
        {applyLabel}
      </Button>
    </div>
  );
}

export default function Reorganize() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const now = useNow(60000);
  const settings = useSettings();
  const data = useDayData();
  const sims = useLiveQuery(async () => (await db.reorganizations.toArray()).filter((r) => !r.deleted_at && r.kind === 'simulation').sort((a, b) => b.created_at.localeCompare(a.created_at)), []) ?? [];
  const simId = params.get('sim');
  const [mode, setMode] = useState<'real' | 'simulation'>(simId ? 'simulation' : 'real');
  useEffect(() => setMode(simId ? 'simulation' : mode), [simId]); // eslint-disable-line react-hooks/exhaustive-deps

  const date = data ? (activeDayOf(data.days)?.date ?? dateKey(now)) : dateKey(now);
  const realInitial = useMemo(() => {
    if (!data) return null;
    const items = dayItems(data, date);
    const tasks = items.filter((x) => x.kind === 'task' && x.status === 'pending');
    const events = items.filter((x) => x.kind === 'event' && !x.eventStatus);
    return {
      items: tasks.map<ReorgItem>((x, i) => ({ id: x.id, taskId: x.id, title: x.title, itemType: 'task', minutes: Math.max(0, (x.plannedMinutes || 30) - Math.round(realMinutesOf(x, data.entries, now) ?? 0)), decision: 'do', order: i, postponeTo: null, delegateTo: '', followUp: null })),
      fixed: events.map<ReorgItem>((x, i) => ({ id: x.id, taskId: x.id, title: x.title, itemType: 'event', minutes: x.plannedMinutes || 30, decision: 'do', order: i, postponeTo: null, delegateTo: '', followUp: null })),
      available: 0,
      criteria: '',
      feedback: '',
    };
  }, [data?.raw.length, date]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data || !realInitial) return null;

  const until = settings.availableUntil && dateKey(settings.availableUntil) === date ? Math.max(0, Math.round(minutesBetween(now, settings.availableUntil))) : null;
  const defaultAvailable = availableMinutes(now, date, settings, data.blocks) ?? until ?? 0;
  const sim = sims.find((s) => s.id === simId);

  const applyReal = async (v: { items: ReorgItem[]; available: number; criteria: string }) => {
    const { undo } = await undoable(async () => {
      for (const it of v.items) {
        const task = await ensureReal(it.taskId!);
        if (!task) continue;
        it.taskId = task.id;
        if (it.decision === 'do') await update('tasks', task.id, { plannedMinutes: Math.max(1, it.minutes + Math.round(realMinutesOf(task, data.entries, now) ?? 0)), order: it.order });
        if (it.decision === 'postpone') await update('tasks', task.id, postpone(task, it.postponeTo ?? addDays(date, 1), stamp(), 'reorganize'));
        if (it.decision === 'delegate') await update('tasks', task.id, { status: 'delegated', delegatedTo: it.delegateTo, followUp: it.followUp, reorganizedOn: date });
        if (it.decision === 'refuse') await update('tasks', task.id, { status: 'refused', reorganizedOn: date });
      }
      await create('reorganizations', { date, kind: 'real', availableMinutes: v.available, items: v.items, criteria: v.criteria, groupFeedback: '' });
    });
    toast(t('reorg.applied'), undo);
    nav('/hoje');
  };

  const saveSim = async (v: { items: ReorgItem[]; available: number; criteria: string; feedback: string }) => {
    if (sim) await update('reorganizations', sim.id, { availableMinutes: v.available, items: v.items, criteria: v.criteria, groupFeedback: v.feedback });
    else {
      const r = await create('reorganizations', { date: dateKey(now), kind: 'simulation', availableMinutes: v.available, items: v.items, criteria: v.criteria, groupFeedback: v.feedback });
      setParams({ sim: r.id }, { replace: true });
    }
    toast(t('reorg.simSaved'));
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Button variant="ghost" className="self-start" onClick={() => nav(-1)}>
        <ArrowLeft size={18} aria-hidden />
        {t('common.back')}
      </Button>
      <PageTitle
        actions={
          mode === 'real' ? (
            <Button variant="soft" onClick={() => (setMode('simulation'), setParams({}, { replace: true }))}>
              {t('reorg.newSim')}
            </Button>
          ) : (
            <Button onClick={() => (setMode('real'), setParams({}, { replace: true }))}>{t('reorg.title')}</Button>
          )
        }
      >
        {mode === 'real' ? t('reorg.title') : t('reorg.simulation')}
      </PageTitle>
      {mode === 'real' ? (
        <Editor key="real" kind="real" initial={realInitial} date={date} defaultAvailable={defaultAvailable} onApply={applyReal} applyLabel={t('common.apply')} />
      ) : (
        <Editor
          key={sim?.id ?? 'new'}
          kind="simulation"
          initial={sim ? { items: sim.items, fixed: [], available: sim.availableMinutes, criteria: sim.criteria, feedback: sim.groupFeedback } : { items: [], fixed: [], available: 180, criteria: '', feedback: '' }}
          date={date}
          defaultAvailable={180}
          onApply={saveSim}
          applyLabel={t('common.save')}
        />
      )}
      {sims.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">{t('reorg.simulations')}</h2>
          <ul className="flex flex-col gap-1">
            {sims.map((s: Reorganization) => (
              <li key={s.id}>
                <Button variant="ghost" className="w-full justify-start" onClick={() => setParams({ sim: s.id })}>
                  {fmtDate(s.date)} · {t('reorg.itemsCount', { count: s.items.length })}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
