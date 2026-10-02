import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { useAll } from '@/state/data';
import { create, remove, update } from '@/db/repo';
import type { Place } from '@/db/types';
import { AutoInput, Button, Field, IconButton, Input, Select, useToast } from './ui';

export const MODES: Place['mode'][] = ['walk', 'transit', 'car', 'other'];

export function PlaceForm({ onDone, onCancel, initialName = '' }: { onDone: (p: Place) => void; onCancel: () => void; initialName?: string }) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [address, setAddress] = useState('');
  const [minutes, setMinutes] = useState('15');
  const [mode, setMode] = useState<Place['mode']>('walk');
  const [tried, setTried] = useState(false);
  const err = tried && !name.trim() ? t('common.required') : null;
  return (
    <div className="flex flex-col gap-3 rounded-[12px] border border-line bg-card p-3">
      <Field label={t('common.name')} error={err}>
        {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!err} placeholder={t('places.namePh')} value={name} onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label={t('places.address')}>{(id) => <Input id={id} placeholder={t('places.addressPh')} value={address} onChange={(e) => setAddress(e.target.value)} />}</Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('places.travel')}>{(id) => <Input id={id} type="number" inputMode="numeric" min={0} value={minutes} onChange={(e) => setMinutes(e.target.value)} />}</Field>
        <Field label={t('places.mode')}>{(id) => <Select id={id} value={mode} onChange={(e) => setMode(e.target.value as Place['mode'])} options={MODES.map((m) => ({ value: m, label: t(`places.modes.${m}`) }))} />}</Field>
      </div>
      <div className="flex gap-2">
        <Button onClick={onCancel}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          onClick={async () => {
            setTried(true);
            if (!name.trim()) return;
            const p = await create('places', { name: name.trim(), address: address.trim(), travelMinutes: Math.max(0, Number(minutes) || 0), mode });
            onDone(p);
          }}
        >
          {t('common.create')}
        </Button>
      </div>
    </div>
  );
}

export function PlacesEditor() {
  const { t } = useTranslation();
  const places = (useAll('places') ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {places.map((p) => (
          <li key={p.id} className="rounded-[12px] border border-line bg-card p-3">
            <div className="flex items-center gap-2">
              <MapPin size={18} aria-hidden className="shrink-0 text-muted" />
              <AutoInput aria-label={t('common.name')} value={p.name} onSave={(v) => v.trim() && update('places', p.id, { name: v.trim() })} />
              <IconButton
                label={t('common.delete')}
                onClick={async () => {
                  const undo = await remove('places', p.id);
                  toast(t('common.deleted'), undo);
                }}
              >
                <Trash2 size={18} />
              </IconButton>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <AutoInput aria-label={t('places.address')} placeholder={t('places.addressPh')} value={p.address} onSave={(v) => update('places', p.id, { address: v })} />
              <AutoInput aria-label={t('places.travel')} type="number" inputMode="numeric" value={String(p.travelMinutes)} onSave={(v) => update('places', p.id, { travelMinutes: Math.max(0, Number(v) || 0) })} />
              <Select aria-label={t('places.mode')} value={p.mode} onChange={(e) => update('places', p.id, { mode: e.target.value as Place['mode'] })} options={MODES.map((m) => ({ value: m, label: t(`places.modes.${m}`) }))} />
            </div>
          </li>
        ))}
      </ul>
      {adding ? (
        <PlaceForm onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
      ) : (
        <Button variant="soft" onClick={() => setAdding(true)}>
          <Plus size={18} aria-hidden />
          {t('places.add')}
        </Button>
      )}
    </div>
  );
}
