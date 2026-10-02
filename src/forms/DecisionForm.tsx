import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateFormProps } from '@/components/CreateMenu';
import { Button, Field, Input, RadioCards, Sheet, TextArea } from '@/components/ui';
import { AreaSelect } from '@/components/fields';
import { create } from '@/db/repo';
import type { Decision } from '@/db/types';
import { suggestApproach } from '@/lib/domain/misc';
import { addDays, dateKey, nowIso } from '@/lib/time';

export const APPROACHES: Decision['approach'][] = ['fast', 'data', 'advice'];

/** Fields shared by the create form and the detail screen. */
export function DecisionFields({ d, set }: { d: Partial<Decision>; set: (p: Partial<Decision>) => void }) {
  const { t } = useTranslation();
  const suggested = suggestApproach(d.impact ?? 'low', d.reversibility ?? 'easy');
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t('decisions.impact')}>
          {() => <RadioCards label={t('decisions.impact')} columns={2} value={d.impact ?? 'low'} onChange={(v) => set({ impact: v, approach: suggestApproach(v, d.reversibility ?? 'easy'), reviewAt: v === 'high' ? (d.reviewAt ?? addDays(d.date ?? dateKey(nowIso()), 14)) : null })} options={[{ value: 'low', label: t('decisions.low') }, { value: 'high', label: t('decisions.high') }]} />}
        </Field>
        <Field label={t('decisions.reversibility')}>
          {() => <RadioCards label={t('decisions.reversibility')} columns={1} value={d.reversibility ?? 'easy'} onChange={(v) => set({ reversibility: v, approach: suggestApproach(d.impact ?? 'low', v) })} options={[{ value: 'easy', label: t('decisions.easy') }, { value: 'hard', label: t('decisions.hard') }]} />}
        </Field>
      </div>
      <Field label={t('decisions.approach')} hint={t('decisions.suggested', { a: t(`decisions.approaches.${suggested}`) })}>
        {() => <RadioCards label={t('decisions.approach')} value={d.approach ?? suggested} onChange={(v) => set({ approach: v })} options={APPROACHES.map((a) => ({ value: a, label: t(`decisions.approaches.${a}`) }))} />}
      </Field>
    </>
  );
}

export function DecisionForm({ prefill, onDone, onCancel }: CreateFormProps) {
  const { t } = useTranslation();
  const [d, setD] = useState<Partial<Decision>>({ text: '', areaId: null, date: prefill.date ?? dateKey(nowIso()), impact: 'low', reversibility: 'easy', approach: 'fast', minutes: null, info: '', askedWho: '', reviewAt: null });
  const [tried, setTried] = useState(false);
  const set = (p: Partial<Decision>) => setD((x) => ({ ...x, ...p }));
  const submit = async () => {
    setTried(true);
    if (!d.text?.trim()) return;
    await create('decisions', { text: d.text.trim(), areaId: d.areaId ?? null, date: d.date!, impact: d.impact!, reversibility: d.reversibility!, approach: d.approach!, minutes: d.minutes ?? null, info: d.info ?? '', askedWho: d.askedWho ?? '', reviewAt: d.impact === 'high' ? (d.reviewAt ?? addDays(d.date!, 14)) : null, reviewOutcome: null, reviewLearned: '' });
    onDone();
  };
  return (
    <Sheet
      open
      onClose={onCancel}
      title={t('create.decision')}
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
        <Field label={t('decisions.text')} error={tried && !d.text?.trim() ? t('common.required') : null}>
          {(id, e) => <TextArea id={id} aria-describedby={e} placeholder={t('decisions.textPh')} value={d.text} onChange={(ev) => set({ text: ev.target.value })} />}
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('common.area')}>{(id) => <AreaSelect id={id} value={d.areaId ?? ''} onChange={(v) => set({ areaId: v || null })} />}</Field>
          <Field label={t('common.date')}>{(id) => <Input id={id} type="date" value={d.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
        </div>
        <DecisionFields d={d} set={set} />
        <Field label={t('decisions.minutes')}>{(id) => <Input id={id} type="number" min={0} inputMode="numeric" value={d.minutes ?? ''} onChange={(e) => set({ minutes: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />}</Field>
        <Field label={t('decisions.info')}>{(id) => <TextArea id={id} value={d.info} onChange={(e) => set({ info: e.target.value })} />}</Field>
        <Field label={t('decisions.askedWho')}>{(id) => <Input id={id} placeholder={t('detail.delegatedToPh')} value={d.askedWho} onChange={(e) => set({ askedWho: e.target.value })} />}</Field>
        {d.impact === 'high' && <Field label={t('decisions.reviewAt')}>{(id) => <Input id={id} type="date" value={d.reviewAt ?? addDays(d.date!, 14)} onChange={(e) => set({ reviewAt: e.target.value || null })} />}</Field>}
      </div>
    </Sheet>
  );
}
