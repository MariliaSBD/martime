import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/db';
import { remove, update } from '@/db/repo';
import type { Reflection } from '@/db/types';
import { AutoInput, Button, Card, Field, Input, ItemMenu, useToast } from '@/components/ui';
import { ReflectionFields } from '@/forms/ReflectionForm';

export default function ReflectionDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const r = useLiveQuery(() => db.reflections.get(id), [id]);
  if (!r || r.deleted_at) return null;
  const set = (p: Partial<Reflection>) => update('reflections', r.id, p);
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
                const undo = await remove('reflections', r.id);
                toast(t('common.deleted'), undo);
                nav(-1);
              },
            },
          ]}
        />
      </div>
      <Card className="flex flex-col gap-4">
        <Field label={t('common.date')}>{(fid) => <Input id={fid} type="date" value={r.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
        <ReflectionFields r={r} set={set} text={(k) => <AutoInput multiline aria-label={t(`reflections.${k}`)} value={String(r[k] ?? '')} onSave={(v) => set({ [k]: v } as Partial<Reflection>)} />} />
      </Card>
    </div>
  );
}
