import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Check, Pause, Play, RotateCcw } from 'lucide-react';
import { db } from '@/db/db';
import type { Task, TimeEntry } from '@/db/types';
import { isVirtualId, parseVirtualId, virtualOccurrence, type Scope } from '@/lib/domain/recurrence';
import { taskTimer, taskIntervals } from '@/lib/domain/timeEntries';
import { deadlineOutcome } from '@/lib/domain/deadlines';
import { applyScope, duplicateTask, patchTask, pauseTask, postponeTask, reopenTask, setDeadline, setEventStatus, arrive } from '@/state/actions/tasks';
import { saveEntry } from '@/state/actions/time';
import { useFlows, isRecurring } from '@/components/flows';
import { AreaSelect, BlockSelect, DurationPicker, EffortSelect, PlacePicker, RefSelect, RepeatPicker, TriSelect, durationFrom, timesError } from '@/components/fields';
import { AutoInput, Button, Card, Field, Input, ItemMenu, Segmented, Toggle, useToast } from '@/components/ui';
import { fmtClock, fmtDateTime, fmtMinutes, fmtTime } from '@/lib/format';
import { addDays, atLocal, dateKey, localHHMM, nowIso } from '@/lib/time';
import { useNow } from '@/state/data';
import { EVENT_STATUSES } from './Today';
import { deadlineTime } from '@/forms/TaskForm';

function useItem(id: string) {
  return useLiveQuery(async () => {
    if (isVirtualId(id)) {
      const v = parseVirtualId(id)!;
      const real = (await db.tasks.where('seriesId').equals(v.seriesId).toArray()).find((x) => x.occurrenceDate === v.date && !x.deleted_at);
      if (real) return { task: real, redirect: real.id };
      const s = await db.tasks.get(v.seriesId);
      return s && !s.deleted_at ? { task: virtualOccurrence(s, v.date) as Task, redirect: null } : { task: null, redirect: null };
    }
    const t = await db.tasks.get(id);
    return { task: t && !t.deleted_at ? t : null, redirect: null };
  }, [id]);
}

function DateTimeEdit({ label, value, onChange }: { label: string; value: string; onChange: (iso: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-semibold">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <Input aria-label={`${label}: data`} type="date" value={dateKey(value)} onChange={(e) => e.target.value && onChange(atLocal(e.target.value, localHHMM(value)).toISOString())} />
        <Input aria-label={label} type="time" value={localHHMM(value)} onChange={(e) => e.target.value && onChange(atLocal(dateKey(value), e.target.value).toISOString())} />
      </div>
    </div>
  );
}

function Intervals({ task, entries }: { task: Task; entries: TimeEntry[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const iv = taskIntervals(task.id, entries);
  if (!iv.length) return null;
  const save = async (e: TimeEntry, patch: Partial<TimeEntry>) => {
    const next = { ...e, ...patch };
    if (next.end && next.end <= next.start) return toast(t('fields.endAfterStart'));
    const r = await saveEntry({ start: next.start, end: next.end }, e.id);
    for (const c of r.changes) toast(t(c.kind === 'removed' ? 'time.removed' : 'time.shortened', { name: c.activity }), r.undo);
  };
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-base font-semibold">{t('detail.realTimes')}</h3>
      {iv.map((e, i) => (
        <div key={e.id} className="grid grid-cols-1 gap-2 rounded-[8px] border border-line p-2 sm:grid-cols-2">
          <DateTimeEdit label={i === 0 ? t('detail.realStart') : t('detail.resumedAt')} value={e.start} onChange={(v) => save(e, { start: v })} />
          {e.end ? <DateTimeEdit label={i === iv.length - 1 ? t('detail.realEnd') : t('detail.pausedAt')} value={e.end} onChange={(v) => save(e, { end: v })} /> : <p className="self-end text-[15px] text-muted">{t('detail.running')}</p>}
        </div>
      ))}
    </div>
  );
}

export default function TaskDetail() {
  const { id: rawId = '' } = useParams();
  const id = decodeURIComponent(rawId);
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const flows = useFlows();
  const now = useNow(1000);
  const res = useItem(id);
  const entries = useLiveQuery(async () => (await db.timeEntries.toArray()).filter((e) => !e.deleted_at), []) ?? [];
  const scopeRef = useRef<Scope | null>(null);

  useEffect(() => {
    if (res?.redirect) nav(`/tarefa/${encodeURIComponent(res.redirect)}`, { replace: true });
  }, [res?.redirect, nav]);

  if (!res) return null;
  const task = res.task;
  if (!task)
    return (
      <div className="mx-auto max-w-2xl">
        <Button variant="ghost" onClick={() => nav(-1)}>
          <ArrowLeft size={18} aria-hidden />
          {t('common.back')}
        </Button>
        <p className="mt-4 text-muted">{t('detail.gone')}</p>
      </div>
    );

  const recurring = isRecurring(task);
  const save = async (patch: Partial<Task>) => {
    if (recurring) {
      if (!scopeRef.current) {
        const s = await flows.askScope();
        if (!s) return;
        scopeRef.current = s;
      }
      if (scopeRef.current !== 'this') {
        await applyScope(task.id, scopeRef.current, { kind: 'edit', patch });
        if (scopeRef.current === 'following' && isVirtualId(task.id)) return; // the occurrence now belongs to a new series
        return;
      }
    }
    const r = await patchTask(task.id, patch);
    if (r && r.id !== task.id) nav(`/tarefa/${encodeURIComponent(r.id)}`, { replace: true });
  };

  const timer = taskTimer(task, entries, now);
  const isTask = task.kind === 'task';
  const orderErr = timesError(task.plannedStart, task.plannedEnd);
  const computed = durationFrom(task.plannedStart, task.plannedEnd);
  const deadlineDate = task.deadline ? dateKey(task.deadline) : '';

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(-1)}>
          <ArrowLeft size={18} aria-hidden />
          {t('common.back')}
        </Button>
        <ItemMenu
          items={[
            ...(!recurring
              ? [
                  {
                    label: t('common.duplicate'),
                    onSelect: async () => {
                      const d = await duplicateTask(task.id);
                      if (d) nav(`/tarefa/${d.id}`);
                    },
                  },
                ]
              : []),
            {
              label: t('common.delete'),
              danger: true,
              onSelect: async () => {
                await flows.remove(task);
                nav(-1);
              },
            },
          ]}
        />
      </div>
      <Card className="flex flex-col gap-4">
        <p className="text-[13px] font-semibold text-muted">{t(isTask ? 'create.task' : 'create.event')}</p>
        <Field label={t('fields.title')}>{(fid) => <AutoInput id={fid} maxLength={120} value={task.title} onSave={(v) => v.trim() && save({ title: v.trim() })} />}</Field>
        <Field label={t('common.area')}>{(fid) => <AreaSelect id={fid} value={task.areaId} onChange={(v) => v && save({ areaId: v })} />}</Field>
        <Field label={t('common.date')}>
          {(fid) => (
            <Input
              id={fid}
              type="date"
              value={task.date ?? ''}
              onChange={async (e) => {
                const v = e.target.value || null;
                if (recurring) return save({ date: v });
                const undo = await postponeTask(task.id, v);
                toast(t('detail.dateChanged'), undo);
              }}
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(isTask ? 'fields.plannedStart' : 'common.start')} error={orderErr ? t('fields.endAfterStart') : null}>
            {(fid, d) => <Input id={fid} type="time" aria-describedby={d} aria-invalid={orderErr} value={task.plannedStart ?? ''} onChange={(e) => save({ plannedStart: e.target.value || null, ...(durationFrom(e.target.value, task.plannedEnd) ? { plannedMinutes: durationFrom(e.target.value, task.plannedEnd)! } : {}) })} />}
          </Field>
          <Field label={t(isTask ? 'fields.plannedEnd' : 'common.end')}>
            {(fid) => <Input id={fid} type="time" value={task.plannedEnd ?? ''} onChange={(e) => save({ plannedEnd: e.target.value || null, ...(durationFrom(task.plannedStart, e.target.value) ? { plannedMinutes: durationFrom(task.plannedStart, e.target.value)! } : {}) })} />}
          </Field>
        </div>
        {isTask &&
          (computed !== null ? (
            <p className="text-[15px] text-muted">{t('fields.durationIs', { n: computed })}</p>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{t('fields.duration')}</span>
              <DurationPicker label={t('fields.duration')} value={task.plannedMinutes || 30} onChange={(m) => save({ plannedMinutes: m })} />
            </div>
          ))}
      </Card>

      {isTask ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('detail.status')}</h2>
          <p className="text-base">
            {t(`status.${task.status === 'pending' ? timer.state : task.status}`)}
            {timer.realMinutes > 0 && ` · ${t('today.realShort', { t: fmtMinutes(timer.realMinutes) })}`}
            {timer.state === 'running' && <span className="ml-2 font-mono tabular-nums">{fmtClock(timer.realMinutes)}</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            {task.status === 'pending' && timer.state !== 'running' && (
              <Button variant="soft" onClick={() => flows.start(task)}>
                <Play size={18} aria-hidden />
                {timer.state === 'paused' ? t('today.resume') : t('today.start')}
              </Button>
            )}
            {timer.state === 'running' && (
              <Button onClick={() => pauseTask(task.id)}>
                <Pause size={18} aria-hidden />
                {t('today.pause')}
              </Button>
            )}
            {task.status === 'pending' && (
              <Button variant="primary" onClick={() => flows.complete(task)}>
                <Check size={18} aria-hidden />
                {t('today.complete')}
              </Button>
            )}
            {task.status !== 'pending' && !isVirtualId(task.id) && (
              <Button onClick={() => reopenTask(task.id)}>
                <RotateCcw size={18} aria-hidden />
                {t('detail.reopen')}
              </Button>
            )}
          </div>
          {task.status === 'pending' && (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  const undo = await postponeTask(task.id, addDays(task.date ?? dateKey(nowIso()), 1));
                  toast(t('detail.postponed'), undo);
                }}
              >
                {t('detail.postponeTomorrow')}
              </Button>
              <Button onClick={() => save({ status: 'delegated' })}>{t('detail.delegate')}</Button>
              <Button onClick={() => save({ status: 'refused' })}>{t('detail.refuse')}</Button>
            </div>
          )}
          {task.status === 'delegated' && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Field label={t('detail.delegatedTo')}>{(fid) => <AutoInput id={fid} placeholder={t('detail.delegatedToPh')} value={task.delegatedTo} onSave={(v) => save({ delegatedTo: v })} />}</Field>
              <Field label={t('detail.followUp')}>{(fid) => <Input id={fid} type="date" value={task.followUp ?? ''} onChange={(e) => save({ followUp: e.target.value || null })} />}</Field>
            </div>
          )}
          {task.status === 'done' && task.completedAt && <p className="text-[15px] text-muted">{t('detail.completedAt', { t: fmtDateTime(task.completedAt) })}</p>}
          {task.status === 'done' && task.deadline && task.completedAt && <p className="text-[15px] font-semibold">{t(`deadline.${deadlineOutcome(task.deadline, task.completedAt)}`)}</p>}
          {task.energyAtDone && <p className="text-[15px] text-muted">{t('detail.energyAtDone', { l: t(`energy.${task.energyAtDone}`) })}</p>}
          <Intervals task={task} entries={entries} />
          {!taskIntervals(task.id, entries).length && task.status === 'done' && (
            <Field label={t('detail.realMinutes')}>{(fid) => <AutoInput id={fid} type="number" inputMode="numeric" value={task.manualMinutes === null ? '' : String(task.manualMinutes)} onSave={(v) => save({ manualMinutes: v === '' ? null : Math.max(0, Number(v) || 0) })} />}</Field>
          )}
        </Card>
      ) : (
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('detail.status')}</h2>
          {task.arrivedAt ? <p className="text-base">{t('today.arrivedAt', { t: fmtTime(task.arrivedAt) })}</p> : <Button variant="primary" className="self-start" onClick={() => arrive(task.id)}>{t('today.arrive')}</Button>}
          <Segmented label={t('detail.status')} value={task.eventStatus ?? ('' as never)} onChange={(v) => setEventStatus(task.id, v)} options={EVENT_STATUSES.map((s) => ({ value: s, label: t(`eventStatus.${s}`) }))} />
        </Card>
      )}

      {(
        <Card className="flex flex-col gap-4">
          {isTask && (
            <>
              <Field label={t('fields.urgent')}>{() => <TriSelect label={t('fields.urgent')} value={task.urgent} onChange={(v) => save({ urgent: v })} />}</Field>
              <Field label={t('fields.important')}>{() => <TriSelect label={t('fields.important')} value={task.important} onChange={(v) => save({ important: v })} />}</Field>
              <Toggle label={t('fields.hard')} checked={task.hard} onChange={(v) => save({ hard: v })} />
              {task.hard && <Field label={t('fields.hardReason')}>{(fid) => <AutoInput id={fid} multiline value={task.hardReason} onSave={(v) => save({ hardReason: v })} />}</Field>}
              <Field label={t('fields.effort')}>{() => <EffortSelect value={task.effort} onChange={(v) => save({ effort: v })} />}</Field>
              <Field label={t('fields.energyBlock')}>{(fid) => <BlockSelect id={fid} value={task.energyBlockId} onChange={(v) => save({ energyBlockId: v })} />}</Field>
              <Field label={t('create.project')}>{(fid) => <RefSelect id={fid} table="projects" value={task.projectId} onChange={(v) => save({ projectId: v })} labelOf={(r) => r.name ?? ''} />}</Field>
              {task.projectId && <Toggle label={t('fields.critical')} checked={task.critical} onChange={(v) => save({ critical: v })} />}
              <Field label={t('create.goal')}>{(fid) => <RefSelect id={fid} table="goals" value={task.goalId} onChange={(v) => save({ goalId: v })} labelOf={(r) => r.what ?? ''} />}</Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('fields.deadline')}>{(fid) => <Input id={fid} type="date" value={deadlineDate} onChange={(e) => setDeadline(task.id, e.target.value ? atLocal(e.target.value, task.deadline ? deadlineTime(task.deadline) : '18:00').toISOString() : null)} />}</Field>
                <Field label={t('fields.deadlineTime')}>{(fid) => <Input id={fid} type="time" disabled={!task.deadline} value={task.deadline ? deadlineTime(task.deadline) : ''} onChange={(e) => task.deadline && e.target.value && setDeadline(task.id, atLocal(deadlineDate, e.target.value).toISOString())} />}</Field>
              </div>
            </>
          )}
          {!task.seriesId && !isVirtualId(task.id) && <Field label={t('fields.repeat')}>{() => <RepeatPicker value={task.repeat} onChange={(r) => save({ repeat: r })} />}</Field>}
          <PlacePicker placeId={task.locationId} travel={task.travelMinutes} onChange={(locationId, travelMinutes) => save({ locationId, travelMinutes })} />
          <Toggle label={t('fields.reminder')} checked={task.reminder} onChange={(v) => save({ reminder: v })} />
          <Field label={t('common.notes')}>{(fid) => <AutoInput id={fid} multiline value={task.notes} onSave={(v) => save({ notes: v })} />}</Field>
        </Card>
      )}

      {task.history.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">{t('detail.history')}</h2>
          <ul className="flex flex-col gap-1 text-[15px]">
            {task.history.map((h, i) => (
              <li key={i}>
                {fmtDateTime(h.at)} · {t(h.type === 'deadline' ? 'detail.deadlineChanged' : 'detail.postponedFromTo', { from: h.from ? (h.type === 'deadline' ? fmtDateTime(h.from) : h.from) : t('common.someday'), to: h.to ? (h.type === 'deadline' ? fmtDateTime(h.to) : h.to) : t('common.someday') })}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
