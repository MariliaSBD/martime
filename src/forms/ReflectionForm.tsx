import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CreateFormProps } from '@/components/CreateMenu';
import { Button, Field, Input, RadioCards, Select, Sheet, TextArea } from '@/components/ui';
import { create } from '@/db/repo';
import type { Reflection } from '@/db/types';
import { dateKey, nowIso } from '@/lib/time';

export const RTYPES: Reflection['type'][] = ['impossible_deadline', 'late_mistake', 'help_overloaded', 'conflicting_request', 'other'];
export const ATTITUDES: NonNullable<Reflection['attitude']>[] = ['proactive', 'assertive', 'passive', 'reactive'];
export const RTEXT: (keyof Reflection)[] = ['did', 'reasoning', 'outcome', 'differently', 'feedback'];

export function ReflectionFields({ r, set, text }: { r: Partial<Reflection>; set: (p: Partial<Reflection>) => void; text: (k: keyof Reflection) => React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <>
      <Field label={t('reflections.situation')}>{() => text('situation')}</Field>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Field label={t('reflections.type')}>{(id) => <Select id={id} value={r.type ?? 'other'} onChange={(e) => set({ type: e.target.value as Reflection['type'] })} options={RTYPES.map((x) => ({ value: x, label: t(`reflections.types.${x}`) }))} />}</Field>
        <Field label={t('reflections.context')}>
          {() => <RadioCards label={t('reflections.context')} columns={2} value={r.context ?? 'real'} onChange={(v) => set({ context: v })} options={[{ value: 'real', label: t('reflections.real') }, { value: 'roleplay', label: t('reflections.roleplay') }]} />}
        </Field>
      </div>
      <Field label={t('reflections.attitude')}>
        {() => <RadioCards label={t('reflections.attitude')} columns={2} value={r.attitude ?? null} onChange={(v) => set({ attitude: v })} options={ATTITUDES.map((a) => ({ value: a, label: t(`reflections.attitudes.${a}`), desc: t(`reflections.attitudeDesc.${a}`) }))} />}
      </Field>
      {RTEXT.map((k) => (
        <Field key={k} label={t(`reflections.${k}`)}>
          {() => text(k)}
        </Field>
      ))}
    </>
  );
}

export function ReflectionForm({ prefill, onDone, onCancel }: CreateFormProps) {
  const { t } = useTranslation();
  const [r, setR] = useState<Partial<Reflection>>({ date: prefill.date ?? dateKey(nowIso()), situation: '', type: 'other', context: 'real', attitude: null, did: '', reasoning: '', outcome: '', differently: '', feedback: '' });
  const [tried, setTried] = useState(false);
  const set = (p: Partial<Reflection>) => setR((x) => ({ ...x, ...p }));
  const submit = async () => {
    setTried(true);
    if (!r.situation?.trim()) return;
    await create('reflections', { date: r.date!, situation: r.situation.trim(), type: r.type!, context: r.context!, attitude: r.attitude ?? null, did: r.did ?? '', reasoning: r.reasoning ?? '', outcome: r.outcome ?? '', differently: r.differently ?? '', feedback: r.feedback ?? '' });
    onDone();
  };
  return (
    <Sheet
      open
      wide
      onClose={onCancel}
      title={t('create.reflection')}
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
        <Field label={t('common.date')}>{(id) => <Input id={id} type="date" value={r.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
        <ReflectionFields
          r={r}
          set={set}
          text={(k) => (
            <>
              <TextArea aria-label={t(`reflections.${k}`)} placeholder={k === 'situation' ? t('reflections.situationPh') : undefined} value={String(r[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<Reflection>)} />
              {k === 'situation' && tried && !r.situation?.trim() && (
                <span role="alert" className="text-[13px] font-medium text-danger-dark">
                  {t('common.required')}
                </span>
              )}
            </>
          )}
        />
      </div>
    </Sheet>
  );
}
