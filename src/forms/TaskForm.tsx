import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { CreateFormProps } from '@/components/CreateMenu';
import { Button, Field, Input, Sheet, TextArea, Toggle } from '@/components/ui';
import { AreaSelect, BlockSelect, DurationPicker, EffortSelect, PlacePicker, RefSelect, RepeatPicker, TriSelect, durationFrom, timesError } from '@/components/fields';
import { createTask } from '@/state/actions/tasks';
import { useSettings } from '@/state/app';
import { useAreas } from '@/state/data';
import type { Task } from '@/db/types';
import { atLocal, localHHMM } from '@/lib/time';

/** Create form for a task or an event (5.2, 5.3). Only the main fields; the rest under "Mais opções". */
export function ItemForm({ kind, prefill, onDone, onCancel }: CreateFormProps & { kind: 'task' | 'event' }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const areas = useAreas() ?? [];
  const defaultArea = settings.lastAreaId && areas.some((a) => a.id === settings.lastAreaId) ? settings.lastAreaId : (areas[0]?.id ?? '');
  const [f, setF] = useState<Partial<Task>>({
    kind,
    title: prefill.title ?? '',
    areaId: '',
    date: prefill.date ?? null,
    plannedStart: prefill.time ?? null,
    plannedEnd: null,
    plannedMinutes: 30,
    projectId: prefill.projectId ?? null,
    goalId: prefill.goalId ?? null,
    critical: prefill.critical ?? false,
    reminder: true,
    urgent: 'unset',
    important: 'unset',
    effort: 'unset',
    hard: false,
    hardReason: '',
    energyBlockId: null,
    deadline: null,
    repeat: null,
    locationId: null,
    travelMinutes: 0,
    notes: '',
  });
  const [more, setMore] = useState(false);
  const [tried, setTried] = useState(false);
  const set = (p: Partial<Task>) => setF((x) => ({ ...x, ...p }));
  const area = f.areaId || defaultArea;

  const titleErr = tried && (!f.title?.trim() || f.title.trim().length > 120) ? (f.title && f.title.length > 120 ? t('fields.titleTooLong') : t('common.required')) : null;
  const areaErr = tried && !area ? t('common.required') : null;
  const orderErr = timesError(f.plannedStart ?? null, f.plannedEnd ?? null) ? t('fields.endAfterStart') : null;
  const eventErr = kind === 'event' && tried && (!f.date || !f.plannedStart || !f.plannedEnd) ? t('fields.eventTimesRequired') : null;
  const computed = durationFrom(f.plannedStart ?? null, f.plannedEnd ?? null);

  const submit = async () => {
    setTried(true);
    if (!f.title?.trim() || f.title.trim().length > 120 || !area || orderErr) return;
    if (kind === 'event' && (!f.date || !f.plannedStart || !f.plannedEnd)) return;
    const minutes = computed ?? f.plannedMinutes ?? 30;
    await createTask({ ...f, title: f.title.trim(), areaId: area, plannedMinutes: kind === 'event' ? (computed ?? 30) : minutes });
    onDone();
  };

  return (
    <Sheet
      open
      onClose={onCancel}
      title={t(`create.${kind}`)}
      footer={
        <>
          <Button onClick={onCancel}>{t('common.cancel')}</Button>
          <Button variant="primary" className="flex-1" onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={t('fields.title')} error={titleErr}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!titleErr} maxLength={121} placeholder={t(kind === 'task' ? 'fields.taskPh' : 'fields.eventPh')} value={f.title} onChange={(e) => set({ title: e.target.value })} />}
        </Field>
        <Field label={t('common.area')} error={areaErr}>
          {(id, d) => <AreaSelect id={id} describedBy={d} invalid={!!areaErr} value={area} onChange={(v) => set({ areaId: v })} />}
        </Field>
        <Field label={t('common.date')} error={eventErr}>
          {(id, d) => <Input id={id} type="date" aria-describedby={d} value={f.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(kind === 'task' ? 'fields.plannedStart' : 'common.start')} error={orderErr}>
            {(id, d) => <Input id={id} type="time" aria-describedby={d} aria-invalid={!!orderErr} value={f.plannedStart ?? ''} onChange={(e) => set({ plannedStart: e.target.value || null })} />}
          </Field>
          <Field label={t(kind === 'task' ? 'fields.plannedEnd' : 'common.end')}>{(id) => <Input id={id} type="time" value={f.plannedEnd ?? ''} onChange={(e) => set({ plannedEnd: e.target.value || null })} />}</Field>
        </div>
        {kind === 'task' &&
          (computed !== null ? (
            <p className="text-[15px] text-muted-bg">{t('fields.durationIs', { n: computed })}</p>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">{t('fields.duration')}</span>
              <DurationPicker label={t('fields.duration')} value={f.plannedMinutes ?? 30} onChange={(m) => set({ plannedMinutes: m })} />
            </div>
          ))}
        <button type="button" aria-expanded={more} onClick={() => setMore(!more)} className="flex min-h-11 items-center gap-2 self-start rounded-[8px] px-1 font-semibold text-primary-dark">
          {more ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
          {t('fields.more')}
        </button>
        {more && <MoreFields kind={kind} f={f} set={set} />}
      </form>
    </Sheet>
  );
}

export function MoreFields({ kind, f, set }: { kind: 'task' | 'event'; f: Partial<Task>; set: (p: Partial<Task>) => void }) {
  const { t } = useTranslation();
  const deadlineDate = f.deadline ? f.deadline.slice(0, 10) : '';
  return (
    <div className="flex flex-col gap-4">
      {kind === 'task' && (
        <>
          <Field label={t('fields.urgent')}>{() => <TriSelect label={t('fields.urgent')} value={f.urgent ?? 'unset'} onChange={(v) => set({ urgent: v })} />}</Field>
          <Field label={t('fields.important')}>{() => <TriSelect label={t('fields.important')} value={f.important ?? 'unset'} onChange={(v) => set({ important: v })} />}</Field>
          <Toggle label={t('fields.hard')} checked={!!f.hard} onChange={(v) => set({ hard: v })} />
          {f.hard && <Field label={t('fields.hardReason')}>{(id) => <TextArea id={id} value={f.hardReason ?? ''} onChange={(e) => set({ hardReason: e.target.value })} />}</Field>}
          <Field label={t('fields.effort')}>{() => <EffortSelect value={f.effort ?? 'unset'} onChange={(v) => set({ effort: v })} />}</Field>
          <Field label={t('fields.energyBlock')}>{(id) => <BlockSelect id={id} value={f.energyBlockId ?? null} onChange={(v) => set({ energyBlockId: v })} />}</Field>
          <Field label={t('create.project')}>{(id) => <RefSelect id={id} table="projects" value={f.projectId ?? null} onChange={(v) => set({ projectId: v })} labelOf={(r) => r.name ?? ''} />}</Field>
          {f.projectId && <Toggle label={t('fields.critical')} checked={!!f.critical} onChange={(v) => set({ critical: v })} />}
          <Field label={t('create.goal')}>{(id) => <RefSelect id={id} table="goals" value={f.goalId ?? null} onChange={(v) => set({ goalId: v })} labelOf={(r) => r.what ?? ''} />}</Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('fields.deadline')}>
              {(id) => <Input id={id} type="date" value={deadlineDate} onChange={(e) => set({ deadline: e.target.value ? atLocal(e.target.value, f.deadline ? deadlineTime(f.deadline) : '18:00').toISOString() : null })} />}
            </Field>
            <Field label={t('fields.deadlineTime')}>{(id) => <Input id={id} type="time" disabled={!f.deadline} value={f.deadline ? deadlineTime(f.deadline) : ''} onChange={(e) => f.deadline && e.target.value && set({ deadline: atLocal(deadlineDate || f.deadline.slice(0, 10), e.target.value).toISOString() })} />}</Field>
          </div>
        </>
      )}
      <Field label={t('fields.repeat')}>{() => <RepeatPicker value={f.repeat ?? null} onChange={(r) => set({ repeat: r })} />}</Field>
      <PlacePicker placeId={f.locationId ?? null} travel={f.travelMinutes ?? 0} onChange={(locationId, travelMinutes) => set({ locationId, travelMinutes })} />
      <Toggle label={t('fields.reminder')} checked={f.reminder ?? true} onChange={(v) => set({ reminder: v })} />
      <Field label={t('common.notes')}>{(id) => <TextArea id={id} value={f.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} />}</Field>
    </div>
  );
}

export function deadlineTime(iso: string): string {
  return localHHMM(iso);
}

export const TaskForm = (p: CreateFormProps) => <ItemForm kind="task" {...p} />;
export const EventForm = (p: CreateFormProps) => <ItemForm kind="event" {...p} />;
