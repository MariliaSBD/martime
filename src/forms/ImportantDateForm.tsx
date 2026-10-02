import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CreateFormProps } from '@/components/CreateMenu';
import { Button, Field, Input, Sheet, Toggle } from '@/components/ui';
import { AreaSelect } from '@/components/fields';
import { create } from '@/db/repo';

export function ImportantDateForm({ prefill, onDone, onCancel }: CreateFormProps) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [date, setDate] = useState(prefill.date ?? '');
  const [yearly, setYearly] = useState(true);
  const [area, setArea] = useState('');
  const [tried, setTried] = useState(false);
  const nameErr = tried && !name.trim() ? t('common.required') : null;
  const dateErr = tried && !date ? t('common.required') : null;
  const submit = async () => {
    setTried(true);
    if (!name.trim() || !date) return;
    const d = await create('importantDates', { name: name.trim(), date, yearly, areaId: area || null, reminders: [7, 1], todos: [] });
    onDone(d.id);
    nav(`/data/${d.id}`);
  };
  return (
    <Sheet
      open
      onClose={onCancel}
      title={t('create.importantDate')}
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
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={!!nameErr} placeholder={t('idates.namePh')} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t('common.date')} error={dateErr}>
          {(id, d) => <Input id={id} type="date" aria-describedby={d} aria-invalid={!!dateErr} value={date} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Toggle label={t('idates.yearly')} checked={yearly} onChange={setYearly} />
        <Field label={t('common.area')}>{(id) => <AreaSelect id={id} value={area} onChange={setArea} />}</Field>
      </div>
    </Sheet>
  );
}
