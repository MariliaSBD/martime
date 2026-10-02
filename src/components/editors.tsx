import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Bell, Plus, Trash2 } from 'lucide-react';
import { useAreas, useBlocks } from '@/state/data';
import { createArea, areaUsage, deleteArea, moveArea } from '@/state/actions/areas';
import { create, remove, update, put, get } from '@/db/repo';
import { blockError } from '@/lib/domain/energy';
import { saveSettings } from '@/state/settings';
import { useSettings } from '@/state/app';
import { enableNotifications, permissionState, type PermissionState } from '@/lib/push';
import type { EnergyBlock, EnergyLevel } from '@/db/types';
import { AutoInput, Button, Field, IconButton, Input, RadioCards, Select, Sheet, Toggle, cx, useToast } from './ui';

export function ColorPicker({ value, onChange, label }: { value: number; onChange: (c: number) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={t('areas.color', { n: c })}
          title={t('areas.color', { n: c })}
          onClick={() => onChange(c)}
          className={cx('flex h-11 w-11 items-center justify-center rounded-full', value === c && 'ring-2 ring-ink ring-offset-2')}
        >
          <span className="h-7 w-7 rounded-full" style={{ background: `var(--c${c})` }} />
        </button>
      ))}
    </div>
  );
}

export function AreasEditor() {
  const { t } = useTranslation();
  const areas = useAreas() ?? [];
  const toast = useToast();
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<{ id: string; count: number } | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [picking, setPicking] = useState<string | null>(null);

  const askDelete = async (id: string) => {
    const count = await areaUsage(id);
    if (count === 0) {
      const undo = await remove('areas', id);
      toast(t('common.deleted'), undo);
      return;
    }
    setMoveTo(areas.find((a) => a.id !== id)?.id ?? '');
    setDeleting({ id, count });
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {areas.map((a, i) => (
          <li key={a.id} className="rounded-[12px] border border-line bg-card p-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-expanded={picking === a.id}
                aria-label={t('areas.colorOf', { name: a.name })}
                title={t('areas.colorOf', { name: a.name })}
                onClick={() => setPicking(picking === a.id ? null : a.id)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-primary-soft/50"
              >
                <span className="h-6 w-6 rounded-full" style={{ background: `var(--c${a.color})` }} />
              </button>
              <AutoInput aria-label={t('common.name')} value={a.name} onSave={(v) => v.trim() && update('areas', a.id, { name: v.trim() })} />
              <IconButton label={t('areas.moveUp')} disabled={i === 0} onClick={() => moveArea(a.id, -1)}>
                <ArrowUp size={18} />
              </IconButton>
              <IconButton label={t('areas.moveDown')} disabled={i === areas.length - 1} onClick={() => moveArea(a.id, 1)}>
                <ArrowDown size={18} />
              </IconButton>
              <IconButton label={t('common.delete')} onClick={() => askDelete(a.id)}>
                <Trash2 size={18} />
              </IconButton>
            </div>
            {picking === a.id && (
              <div className="mt-2">
                <ColorPicker
                  label={t('areas.colorOf', { name: a.name })}
                  value={a.color}
                  onChange={(c) => {
                    void update('areas', a.id, { color: c });
                    setPicking(null);
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await createArea(name);
          setName('');
        }}
      >
        <Input aria-label={t('areas.new')} placeholder={t('areas.newPh')} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="soft">
          <Plus size={18} aria-hidden />
          {t('common.add')}
        </Button>
      </form>
      <Sheet
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t('areas.deleteTitle')}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={!moveTo}
              onClick={async () => {
                await deleteArea(deleting!.id, moveTo);
                setDeleting(null);
              }}
            >
              {t('areas.moveAndDelete')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-base">{t('areas.hasItems', { count: deleting?.count ?? 0 })}</p>
        <Field label={t('areas.moveTo')}>{(id) => <Select id={id} value={moveTo} onChange={(e) => setMoveTo(e.target.value)} options={areas.filter((a) => a.id !== deleting?.id).map((a) => ({ value: a.id, label: a.name }))} />}</Field>
      </Sheet>
    </div>
  );
}

const LEVELS: EnergyLevel[] = ['high', 'medium', 'low'];

export function BlockForm({ initial, onDone, onCancel }: { initial?: EnergyBlock; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const blocks = useBlocks() ?? [];
  const [name, setName] = useState(initial?.name ?? '');
  const [start, setStart] = useState(initial?.start ?? '');
  const [end, setEnd] = useState(initial?.end ?? '');
  const [level, setLevel] = useState<EnergyLevel>(initial?.level ?? 'high');
  const [tried, setTried] = useState(false);
  const err = start && end ? blockError({ id: initial?.id ?? '', start, end }, blocks) : null;
  const nameErr = tried && !name.trim() ? t('common.required') : null;
  const timeErr = tried && (!start || !end) ? t('common.required') : err === 'order' ? t('blocks.errOrder') : err === 'overlap' ? t('blocks.errOverlap') : null;
  const submit = async () => {
    setTried(true);
    if (!name.trim() || !start || !end || err) return;
    if (initial) await update('energyBlocks', initial.id, { name: name.trim(), start, end, level });
    else await create('energyBlocks', { name: name.trim(), start, end, level });
    onDone();
  };
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-card p-3">
      <Field label={t('common.name')} error={nameErr}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!nameErr} placeholder={t('blocks.namePh')} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('common.start')} error={timeErr}>
          {(id, d) => <Input id={id} type="time" aria-describedby={d} aria-invalid={!!timeErr} value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field label={t('common.end')}>{(id) => <Input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <RadioCards label={t('blocks.level')} value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l, label: t(`energy.${l}`) }))} />
      <div className="flex gap-2">
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={submit}>
          {initial ? t('common.save') : t('common.create')}
        </Button>
      </div>
    </div>
  );
}

export function BlocksEditor() {
  const { t } = useTranslation();
  const blocks = useBlocks() ?? [];
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {blocks.map((b) =>
          editing === b.id ? (
            <li key={b.id}>
              <BlockForm initial={b} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded-[12px] border border-line bg-card px-3 py-2">
              <button type="button" className="min-h-11 flex-1 text-left" onClick={() => setEditing(b.id)}>
                <span className="font-semibold">{b.name}</span>
                <span className="ml-2 text-[15px] text-muted">
                  {b.start}–{b.end} · {t(`energy.${b.level}`)}
                </span>
              </button>
              <IconButton
                label={t('common.delete')}
                onClick={async () => {
                  const before = await get('energyBlocks', b.id);
                  const undo = await remove('energyBlocks', b.id);
                  toast(t('common.deleted'), before ? undo : undefined);
                }}
              >
                <Trash2 size={18} />
              </IconButton>
            </li>
          ),
        )}
      </ul>
      {adding ? (
        <BlockForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="soft" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden />
          {t('blocks.add')}
        </Button>
      )}
    </div>
  );
}

export function ScheduleEditor() {
  const { t } = useTranslation();
  const s = useSettings();
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('schedule.wake')}>{(id) => <Input id={id} type="time" value={s.wakeTarget ?? ''} onChange={(e) => saveSettings({ wakeTarget: e.target.value || null, ...(e.target.value ? {} : { fixedSchedule: false }) })} />}</Field>
        <Field label={t('schedule.sleep')}>{(id) => <Input id={id} type="time" value={s.sleepTarget ?? ''} onChange={(e) => saveSettings({ sleepTarget: e.target.value || null, ...(e.target.value ? {} : { fixedSchedule: false }) })} />}</Field>
      </div>
      {s.wakeTarget && s.sleepTarget && (
        <Toggle
          label={t('schedule.fixed')}
          checked={s.fixedSchedule}
          onChange={(v) => saveSettings({ fixedSchedule: v, notifications: { ...s.notifications, goodMorning: v ? true : s.notifications.goodMorning } })}
        />
      )}
    </div>
  );
}

export function EnableNotificationsButton({ onResult }: { onResult?: (p: PermissionState) => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<PermissionState>(permissionState());
  if (state === 'granted') return <p className="text-base font-semibold text-success-dark">{t('notif.permission.granted')}</p>;
  if (state === 'unsupported') return <p className="text-base text-muted">{t('notif.permission.unsupported')}</p>;
  if (state === 'denied') return <p className="text-base text-muted">{t('notif.permission.denied')}</p>;
  return (
    <Button
      variant="primary"
      onClick={async () => {
        const r = await enableNotifications().catch(() => permissionState());
        setState(r);
        onResult?.(r);
      }}
    >
      <Bell size={18} aria-hidden />
      {t('notif.enable')}
    </Button>
  );
}

/** Keeps the type used by restore in other modules. */
export const restore = put;
