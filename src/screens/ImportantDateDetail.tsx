import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { remove, undoable, update, uuid } from '@/db/repo';
import type { ImportantDate } from '@/db/types';
import { AreaSelect } from '@/components/fields';
import { AutoInput, Button, Card, Field, IconButton, Input, ItemMenu, Toggle, useToast } from '@/components/ui';
import { syncTodoTasks } from '@/state/actions/importantDates';
import { nextOccurrence } from '@/lib/domain/importantDates';
import { dateKey, nowIso } from '@/lib/time';
import { fmtDate } from '@/lib/format';

export default function ImportantDateDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const d = useLiveQuery(() => db.importantDates.get(id), [id]);
  const [todo, setTodo] = useState({ text: '', days: '3' });
  const [rem, setRem] = useState('');
  useEffect(() => {
    if (d && !d.deleted_at) void syncTodoTasks(d.id);
  }, [d?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || d.deleted_at) return null;
  const set = (p: Partial<ImportantDate>) => update('importantDates', d.id, p);
  const next = nextOccurrence(d, dateKey(nowIso()));
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
                const { undo } = await undoable(async () => {
                  await remove('importantDates', d.id);
                  await syncTodoTasks(d.id);
                });
                toast(t('common.deleted'), undo);
                nav(-1);
              },
            },
          ]}
        />
      </div>
      <Card className="flex flex-col gap-4">
        <Field label={t('common.name')}>{(fid) => <AutoInput id={fid} value={d.name} onSave={(v) => v.trim() && set({ name: v.trim() })} />}</Field>
        <Field label={t('common.date')}>{(fid) => <Input id={fid} type="date" value={d.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />}</Field>
        {next && <p className="text-[15px] text-muted">{t('idates.next', { d: fmtDate(next, { day: 'numeric', month: 'long', year: 'numeric' }) })}</p>}
        <Toggle label={t('idates.yearly')} checked={d.yearly} onChange={(v) => set({ yearly: v })} />
        <Field label={t('common.area')}>{(fid) => <AreaSelect id={fid} value={d.areaId ?? ''} onChange={(v) => set({ areaId: v || null })} />}</Field>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('idates.reminders')}</h2>
        <ul className="flex flex-wrap gap-2">
          {[...d.reminders].sort((a, b) => b - a).map((r) => (
            <li key={r} className="flex items-center gap-1 rounded-full border border-line bg-card pl-3">
              <span className="text-[15px]">{r === 0 ? t('idates.sameDay') : r === 1 ? t('idates.dayBefore') : t('idates.daysBefore', { n: r })}</span>
              <IconButton label={t('common.delete')} onClick={() => set({ reminders: d.reminders.filter((x) => x !== r) })}>
                <Trash2 size={16} />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(rem);
            if (rem === '' || n < 0 || d.reminders.includes(n)) return;
            void set({ reminders: [...d.reminders, n] });
            setRem('');
          }}
        >
          <Input type="number" min={0} inputMode="numeric" aria-label={t('idates.reminderDays')} placeholder={t('idates.reminderDays')} value={rem} onChange={(e) => setRem(e.target.value)} />
          <Button type="submit" variant="soft">
            <Plus size={18} aria-hidden />
            {t('common.add')}
          </Button>
        </form>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('idates.todos')}</h2>
        <ul className="flex flex-col gap-2">
          {d.todos.map((x) => (
            <li key={x.id} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2">
              <AutoInput aria-label={t('idates.todo')} value={x.text} onSave={(v) => set({ todos: d.todos.map((y) => (y.id === x.id ? { ...y, text: v } : y)) })} />
              <AutoInput aria-label={t('idates.todoDays', { name: x.text })} type="number" inputMode="numeric" value={String(x.daysBefore)} onSave={(v) => set({ todos: d.todos.map((y) => (y.id === x.id ? { ...y, daysBefore: Math.max(0, Number(v) || 0) } : y)) })} />
              <IconButton label={t('common.delete')} onClick={() => set({ todos: d.todos.filter((y) => y.id !== x.id) })}>
                <Trash2 size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="grid grid-cols-[1fr_6rem_auto] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!todo.text.trim()) return;
            void set({ todos: [...d.todos, { id: uuid(), text: todo.text.trim(), daysBefore: Math.max(0, Number(todo.days) || 0) }] });
            setTodo({ text: '', days: '3' });
          }}
        >
          <Input aria-label={t('idates.todo')} placeholder={t('idates.todoPh')} value={todo.text} onChange={(e) => setTodo({ ...todo, text: e.target.value })} />
          <Input aria-label={t('idates.daysBeforeLabel')} type="number" min={0} inputMode="numeric" value={todo.days} onChange={(e) => setTodo({ ...todo, days: e.target.value })} />
          <Button type="submit" variant="soft">
            <Plus size={18} aria-hidden />
            {t('common.add')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
