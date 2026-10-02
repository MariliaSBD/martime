import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Classification, TimeEntry } from '@/db/types';
import { saveEntry } from '@/state/actions/time';
import { remove } from '@/db/repo';
import { atLocal, dateKey, localHHMM } from '@/lib/time';
import { AreaSelect } from './fields';
import { Button, Field, Input, RadioCards, Sheet, useToast } from './ui';

const CLS: Classification[] = ['essential', 'useful', 'waste', 'travel'];

/** Create or edit a time entry; overlapping entries are adjusted with a notice (5.10). */
export function EntrySheet({ open, onClose, entry, start, end }: { open: boolean; onClose: () => void; entry?: TimeEntry | null; start?: string; end?: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [activity, setActivity] = useState('');
  const [area, setArea] = useState('');
  const [cls, setCls] = useState<Classification>('useful');
  const [s, setS] = useState({ d: '', t: '' });
  const [e, setE] = useState({ d: '', t: '' });
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (!open) return;
    const st = entry?.start ?? start ?? new Date().toISOString();
    const en = entry?.end ?? end ?? null;
    setActivity(entry?.activity ?? '');
    setArea(entry?.areaId ?? '');
    setCls(entry?.classification ?? 'useful');
    setS({ d: dateKey(st), t: localHHMM(st) });
    setE(en ? { d: dateKey(en), t: localHHMM(en) } : { d: '', t: '' });
    setTried(false);
  }, [open, entry?.id, start, end]); // eslint-disable-line react-hooks/exhaustive-deps
  const startIso = s.d && s.t ? atLocal(s.d, s.t).toISOString() : null;
  const endIso = e.d && e.t ? atLocal(e.d, e.t).toISOString() : null;
  const orderErr = startIso && endIso && endIso <= startIso ? t('fields.endAfterStart') : null;
  const submit = async () => {
    setTried(true);
    if (!activity.trim() || !startIso || orderErr || (!endIso && !entry)) return;
    const r = await saveEntry({ start: startIso, end: endIso, activity: activity.trim(), areaId: area || null, classification: cls, ...(entry ? {} : { source: 'manual' as const }) }, entry?.id);
    for (const c of r.changes) toast(t(c.kind === 'removed' ? 'time.removed' : 'time.shortened', { name: c.activity }), r.undo);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? t('time.edit') : t('time.fill')}
      footer={
        <>
          {entry && (
            <Button
              variant="danger"
              onClick={async () => {
                const undo = await remove('timeEntries', entry.id);
                toast(t('common.deleted'), undo);
                onClose();
              }}
            >
              {t('common.delete')}
            </Button>
          )}
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" className="flex-1" onClick={submit}>
            {entry ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('today.activity')} error={tried && !activity.trim() ? t('common.required') : null}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder={t('today.activityPh')} value={activity} onChange={(ev) => setActivity(ev.target.value)} />}
        </Field>
        <Field label={t('common.area')}>{(id) => <AreaSelect id={id} value={area} onChange={setArea} />}</Field>
        <RadioCards label={t('today.classification')} columns={2} value={cls} onChange={setCls} options={CLS.map((c) => ({ value: c, label: t(`class.${c}`) }))} />
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('common.start')} error={orderErr}>
            {(id, d) => <Input id={id} type="time" aria-describedby={d} value={s.t} onChange={(ev) => setS({ ...s, t: ev.target.value })} />}
          </Field>
          <Field label={t('time.startDate')}>{(id) => <Input id={id} type="date" value={s.d} onChange={(ev) => setS({ ...s, d: ev.target.value })} />}</Field>
          <Field label={t('common.end')}>{(id) => <Input id={id} type="time" value={e.t} onChange={(ev) => setE({ d: e.d || s.d, t: ev.target.value })} />}</Field>
          <Field label={t('time.endDate')}>{(id) => <Input id={id} type="date" value={e.d} onChange={(ev) => setE({ ...e, d: ev.target.value })} />}</Field>
        </div>
      </div>
    </Sheet>
  );
}
