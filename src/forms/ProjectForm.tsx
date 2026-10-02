import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreateFormProps } from '@/components/CreateMenu';
import { Button, Field, Input, Sheet, TextArea } from '@/components/ui';
import { AreaSelect } from '@/components/fields';
import { create } from '@/db/repo';
import { useSettings } from '@/state/app';
import { useAreas } from '@/state/data';

export function ProjectForm({ prefill, onDone, onCancel }: CreateFormProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const s = useSettings();
  const areas = useAreas() ?? [];
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [start, setStart] = useState(prefill.date ?? '');
  const [end, setEnd] = useState('');
  const [objective, setObjective] = useState('');
  const [tried, setTried] = useState(false);
  const areaId = area || s.lastAreaId || areas[0]?.id || '';
  const nameErr = tried && !name.trim() ? t('common.required') : null;
  const dateErr = start && end && end < start ? t('fields.endAfterStart') : null;
  const submit = async () => {
    setTried(true);
    if (!name.trim() || !areaId || dateErr) return;
    const p = await create('projects', { name: name.trim(), areaId, startDate: start || null, endDate: end || null, objective, status: 'active', resources: [], obstacles: [], diary: [] });
    onDone(p.id);
    nav(`/projeto/${p.id}`);
  };
  return (
    <Sheet
      open
      onClose={onCancel}
      title={t('create.project')}
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
        <Field label={t('common.name')} error={nameErr}>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!nameErr} placeholder={t('projects.namePh')} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('common.area')}>{(id) => <AreaSelect id={id} value={areaId} onChange={setArea} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('projects.start')} error={dateErr}>
            {(id, d) => <Input id={id} type="date" aria-describedby={d} value={start} onChange={(e) => setStart(e.target.value)} />}
          </Field>
          <Field label={t('projects.end')}>{(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
        </div>
        <Field label={t('projects.objective')}>{(id) => <TextArea id={id} placeholder={t('projects.objectivePh')} value={objective} onChange={(e) => setObjective(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}
