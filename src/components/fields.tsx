import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAll, useAreas, useBlocks } from '@/state/data';
import type { Place, RepeatRule, TriState, Effort } from '@/db/types';
import { update } from '@/db/repo';
import { hhmmToMinutes, minutesToHHMM } from '@/lib/time';
import { weekdayName } from '@/lib/format';
import { Button, Field, Input, Select, Segmented, Sheet, cx } from './ui';
import { PlaceForm } from './PlacesEditor';

export function AreaSelect({ value, onChange, id, describedBy, invalid }: { value: string; onChange: (v: string) => void; id?: string; describedBy?: string; invalid?: boolean }) {
  const { t } = useTranslation();
  const areas = useAreas() ?? [];
  return <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} value={value} onChange={(e) => onChange(e.target.value)} options={[{ value: '', label: t('fields.chooseArea') }, ...areas.map((a) => ({ value: a.id, label: a.name }))]} />;
}

export const QUICK_DURATIONS = [15, 30, 45, 60, 90, 120];

export function DurationPicker({ value, onChange, label }: { value: number; onChange: (m: number) => void; label: string }) {
  const { t } = useTranslation();
  const custom = !QUICK_DURATIONS.includes(value);
  const [showCustom, setShowCustom] = useState(custom);
  return (
    <div className="flex flex-col gap-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1">
        {QUICK_DURATIONS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={value === m && !showCustom}
            onClick={() => {
              setShowCustom(false);
              onChange(m);
            }}
            className={cx('min-h-11 min-w-14 rounded-[8px] border px-2 text-[15px] font-semibold', value === m && !showCustom ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-card')}
          >
            {m}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={showCustom} onClick={() => setShowCustom(true)} className={cx('min-h-11 rounded-[8px] border px-3 text-[15px] font-semibold', showCustom ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-card')}>
          {t('fields.custom')}
        </button>
      </div>
      {showCustom && <Input type="number" inputMode="numeric" min={1} aria-label={t('fields.customMinutes')} value={String(value)} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} />}
    </div>
  );
}

/** Start/end times; with both, the duration is computed. Returns the error for "end before start". */
export function timesError(start: string | null, end: string | null): boolean {
  return !!start && !!end && hhmmToMinutes(end) <= hhmmToMinutes(start);
}

export function durationFrom(start: string | null, end: string | null): number | null {
  if (!start || !end || timesError(start, end)) return null;
  return hhmmToMinutes(end) - hhmmToMinutes(start);
}

export function endFrom(start: string, minutes: number): string {
  return minutesToHHMM(hhmmToMinutes(start) + minutes);
}

export function TriSelect({ value, onChange, label }: { value: TriState; onChange: (v: TriState) => void; label: string }) {
  const { t } = useTranslation();
  return (
    <Segmented
      label={label}
      value={value}
      onChange={onChange}
      options={[
        { value: 'yes', label: t('common.yes') },
        { value: 'no', label: t('common.no') },
        { value: 'unset', label: t('common.unset') },
      ]}
    />
  );
}

export function EffortSelect({ value, onChange }: { value: Effort; onChange: (v: Effort) => void }) {
  const { t } = useTranslation();
  return (
    <Segmented
      label={t('fields.effort')}
      value={value}
      onChange={onChange}
      options={[
        { value: 'demanding', label: t('fields.demanding') },
        { value: 'routine', label: t('fields.routine') },
        { value: 'unset', label: t('common.unset') },
      ]}
    />
  );
}

export function BlockSelect({ value, onChange, id }: { value: string | null; onChange: (v: string | null) => void; id?: string }) {
  const { t } = useTranslation();
  const blocks = useBlocks() ?? [];
  return <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} options={[{ value: '', label: t('common.none') }, ...blocks.map((b) => ({ value: b.id, label: `${b.name} (${b.start}–${b.end})` }))]} />;
}

export function RefSelect({ table, value, onChange, id, labelOf }: { table: 'projects' | 'goals'; value: string | null; onChange: (v: string | null) => void; id?: string; labelOf: (r: { name?: string; what?: string }) => string }) {
  const { t } = useTranslation();
  const rows = (useAll(table) ?? []) as { id: string; name?: string; what?: string }[];
  return <Select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} options={[{ value: '', label: t('common.none') }, ...rows.map((r) => ({ value: r.id, label: labelOf(r) }))]} />;
}

export function RepeatPicker({ value, onChange }: { value: RepeatRule | null; onChange: (r: RepeatRule | null) => void }) {
  const { t } = useTranslation();
  const freq = value?.freq ?? 'none';
  return (
    <div className="flex flex-col gap-2">
      <Select
        aria-label={t('fields.repeat')}
        value={freq}
        onChange={(e) => {
          const f = e.target.value;
          onChange(f === 'none' ? null : { freq: f as RepeatRule['freq'], days: f === 'weekdays' ? (value?.days ?? [1, 2, 3, 4, 5]) : undefined, until: value?.until ?? null });
        }}
        options={['none', 'daily', 'weekdays', 'weekly', 'monthly'].map((f) => ({ value: f, label: t(`repeat.${f}`) }))}
      />
      {value?.freq === 'weekdays' && (
        <div role="group" aria-label={t('repeat.weekdays')} className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => {
            const on = value.days?.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                aria-label={weekdayName(d)}
                onClick={() => onChange({ ...value, days: on ? value.days!.filter((x) => x !== d) : [...(value.days ?? []), d].sort() })}
                className={cx('h-11 w-11 rounded-full border text-[15px] font-semibold', on ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-card')}
              >
                {weekdayName(d, 'narrow')}
              </button>
            );
          })}
        </div>
      )}
      {value && <Field label={t('repeat.until')}>{(id) => <Input id={id} type="date" value={value.until ?? ''} onChange={(e) => onChange({ ...value, until: e.target.value || null })} />}</Field>}
    </div>
  );
}

/** Place with travel time pre-filled; changing the travel asks whether to update the usual value (5.12). */
export function PlacePicker({ placeId, travel, onChange }: { placeId: string | null; travel: number; onChange: (placeId: string | null, travel: number) => void }) {
  const { t } = useTranslation();
  const places = (useAll('places') ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const [adding, setAdding] = useState(false);
  const [ask, setAsk] = useState<{ place: Place; minutes: number } | null>(null);
  const place = places.find((p) => p.id === placeId);
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={t('fields.place')}>
          {(id) => (
            <Select
              id={id}
              value={placeId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new') return setAdding(true);
                const p = places.find((x) => x.id === e.target.value);
                onChange(p?.id ?? null, p?.travelMinutes ?? 0);
              }}
              options={[{ value: '', label: t('common.none') }, ...places.map((p) => ({ value: p.id, label: p.name })), { value: '__new', label: t('places.add') }]}
            />
          )}
        </Field>
        <Field label={t('fields.travel')}>
          {(id) => (
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={0}
              value={String(travel)}
              onChange={(e) => onChange(placeId, Math.max(0, Number(e.target.value) || 0))}
              onBlur={() => place && travel !== place.travelMinutes && setAsk({ place, minutes: travel })}
            />
          )}
        </Field>
      </div>
      {adding && (
        <PlaceForm
          onCancel={() => setAdding(false)}
          onDone={(p) => {
            setAdding(false);
            onChange(p.id, p.travelMinutes);
          }}
        />
      )}
      <Sheet
        open={!!ask}
        onClose={() => setAsk(null)}
        title={t('places.updateUsualTitle')}
        footer={
          <>
            <Button onClick={() => setAsk(null)}>{t('common.no')}</Button>
            <Button
              variant="primary"
              onClick={async () => {
                await update('places', ask!.place.id, { travelMinutes: ask!.minutes });
                setAsk(null);
              }}
            >
              {t('places.updateUsual')}
            </Button>
          </>
        }
      >
        <p className="text-base">{ask && t('places.updateUsualQ', { place: ask.place.name, n: ask.minutes })}</p>
      </Sheet>
    </div>
  );
}
