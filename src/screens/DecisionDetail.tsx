import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/db';
import { remove, update } from '@/db/repo';
import type { Decision } from '@/db/types';
import { AutoInput, Button, Card, Field, Input, ItemMenu, RadioCards, useToast } from '@/components/ui';
import { AreaSelect } from '@/components/fields';
import { DecisionFields } from '@/forms/DecisionForm';
import { dateKey, nowIso, addDays } from '@/lib/time';

export default function DecisionDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const d = useLiveQuery(() => db.decisions.get(id), [id]);
  if (!d || d.deleted_at) return null;
  const set = (p: Partial<Decision>) => update('decisions', d.id, p);
  const due = d.reviewAt && d.reviewAt <= dateKey(nowIso());
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => nav(-1)}>
          <ArrowLeft size={18} aria-hidden />
          {t('common.back')}
        </Button>
        <ItemMenu
          items={[
            {
              label: t('common.delete'),
              danger: true,
              onSelect: async () => {
                const undo = await remove('decisions', d.id);
                toast(t('common.deleted'), undo);
                nav(-1);
              },
            },
          ]}
        />
      </div>
      <Card className="flex flex-col gap-4">
        <Field label={t('decisions.text')}>{(fid) => <AutoInput id={fid} multiline value={d.text} onSave={(v) => v.trim() && set({ text: v.trim() })} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('common.area')}>{(fid) => <AreaSelect id={fid} value={d.areaId ?? ''} onChange={(v) => set({ areaId: v || null })} />}</Field>
          <Field label={t('common.date')}>{(fid) => <Input id={fid} type="date" value={d.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
        </div>
        <DecisionFields d={d} set={(p) => set(p)} />
        <Field label={t('decisions.minutes')}>{(fid) => <AutoInput id={fid} type="number" value={d.minutes === null ? '' : String(d.minutes)} onSave={(v) => set({ minutes: v === '' ? null : Math.max(0, Number(v) || 0) })} />}</Field>
        <Field label={t('decisions.info')}>{(fid) => <AutoInput id={fid} multiline value={d.info} onSave={(v) => set({ info: v })} />}</Field>
        <Field label={t('decisions.askedWho')}>{(fid) => <AutoInput id={fid} value={d.askedWho} onSave={(v) => set({ askedWho: v })} />}</Field>
        {d.impact === 'high' && <Field label={t('decisions.reviewAt')}>{(fid) => <Input id={fid} type="date" value={d.reviewAt ?? addDays(d.date, 14)} onChange={(e) => set({ reviewAt: e.target.value || null })} />}</Field>}
      </Card>
      {d.impact === 'high' && (
        <Card className="flex flex-col gap-4" data-testid="decision-review">
          <h2 className="text-lg font-semibold">{due ? t('decisions.reviewNow') : t('decisions.reviewLater')}</h2>
          <Field label={t('decisions.howWent')}>
            {() => <RadioCards label={t('decisions.howWent')} value={d.reviewOutcome} onChange={(v) => set({ reviewOutcome: v })} options={(['good', 'meh', 'bad'] as const).map((o) => ({ value: o, label: t(`decisions.outcomes.${o}`) }))} />}
          </Field>
          <Field label={t('goals.learned')}>{(fid) => <AutoInput id={fid} multiline value={d.reviewLearned} onSave={(v) => set({ reviewLearned: v })} />}</Field>
        </Card>
      )}
    </div>
  );
}
