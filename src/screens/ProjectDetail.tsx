import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CircleAlert, Plus, Trash2 } from 'lucide-react';
import { db } from '@/db/db';
import { remove, undoable, update, uuid } from '@/db/repo';
import type { Project, Task } from '@/db/types';
import { useCreate } from '@/components/CreateMenu';
import { AreaSelect } from '@/components/fields';
import { AutoInput, Bar, Button, Card, Field, IconButton, Input, ItemMenu, Select, Sheet, Toggle, useToast } from '@/components/ui';
import { TaskCard } from '@/components/TaskCard';
import { useDayData } from './today/useToday';
import { useNow } from '@/state/data';
import { criticalLate, projectSteps } from './Tasks';
import { addDays, dateKey, diffDays } from '@/lib/time';
import { fmtDate } from '@/lib/format';
import { patchTask } from '@/state/actions/tasks';

/** Timeline: one bar per step between the project dates, critical ones highlighted. */
export function Timeline({ project, steps, compact = false }: { project: Project; steps: Task[]; compact?: boolean }) {
  const { t } = useTranslation();
  const dated = steps.filter((s) => s.date || s.deadline);
  if (!dated.length) return null;
  const starts = dated.map((s) => s.date ?? dateKey(s.deadline!));
  const ends = dated.map((s) => (s.deadline ? dateKey(s.deadline) : s.date!));
  const from = project.startDate ?? starts.reduce((m, x) => (x < m ? x : m));
  const to = project.endDate ?? ends.reduce((m, x) => (x > m ? x : m));
  const span = Math.max(1, diffDays(from, to) + 1);
  const pos = (d: string) => Math.max(0, Math.min(100, (diffDays(from, d) / span) * 100));
  return (
    <div className="flex flex-col gap-1.5" role="list" aria-label={t('projects.timeline')}>
      <div className="flex justify-between text-[13px] text-muted">
        <span>{fmtDate(from)}</span>
        <span>{fmtDate(to)}</span>
      </div>
      {dated.map((s, i) => {
        const a = starts[i];
        const b = ends[i] < a ? a : ends[i];
        const left = pos(a);
        const width = Math.max(2, pos(addDays(b, 1)) - left);
        return (
          <div key={s.id} role="listitem" className="flex items-center gap-2">
            <span className={`w-28 shrink-0 truncate text-[13px] ${compact ? '' : 'sm:w-40'} ${s.critical ? 'font-bold' : ''}`}>{s.title}</span>
            <div className="relative h-5 flex-1 rounded-full bg-line/60">
              <div
                className="absolute inset-y-0 rounded-full"
                style={{ left: `${left}%`, width: `${width}%`, background: s.critical ? 'var(--primary)' : 'var(--c5)', opacity: s.status === 'done' ? 0.5 : 1 }}
                aria-hidden
              />
            </div>
            <span className="w-24 shrink-0 text-right text-[13px] text-muted">
              {s.critical ? t('projects.critical') : t('projects.accessory')}
              {s.status === 'done' && ' ✓'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ListEditor({ items, onChange, placeholder, label }: { items: { id: string; text: string }[]; onChange: (x: { id: string; text: string }[]) => void; placeholder: string; label: string }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {items.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <AutoInput aria-label={label} value={r.text} onSave={(v) => onChange(items.map((x) => (x.id === r.id ? { ...x, text: v } : x)))} />
            <IconButton label={t('common.delete')} onClick={() => onChange(items.filter((x) => x.id !== r.id))}>
              <Trash2 size={18} />
            </IconButton>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onChange([...items, { id: uuid(), text: text.trim() }]);
          setText('');
        }}
      >
        <Input aria-label={label} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" variant="soft">
          <Plus size={18} aria-hidden />
          {t('common.add')}
        </Button>
      </form>
    </div>
  );
}

export default function ProjectDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const { open } = useCreate();
  const now = useNow(60000);
  const data = useDayData();
  const p = useLiveQuery(() => db.projects.get(id), [id]);
  const [obs, setObs] = useState({ obstacle: '', plan: '' });
  const [askDelete, setAskDelete] = useState(false);
  if (!p || p.deleted_at || !data) return null;
  const steps = projectSteps(p, data.raw).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'));
  const done = steps.filter((s) => s.status === 'done').length;
  const today = dateKey(now);
  const set = (patch: Partial<Project>) => update('projects', p.id, patch);
  const note = p.diary.find((d) => d.date === today);
  const ctx = { areas: data.areas, places: data.places, entries: data.entries, now };

  const del = async (withSteps: boolean) => {
    const { undo } = await undoable(async () => {
      for (const s of steps) {
        if (withSteps) await remove('tasks', s.id);
        else await patchTask(s.id, { projectId: null, critical: false });
      }
      await remove('projects', p.id);
    });
    setAskDelete(false);
    toast(t('common.deleted'), undo);
    nav('/tarefas');
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
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
                if (steps.length) return setAskDelete(true);
                const undo = await remove('projects', p.id);
                toast(t('common.deleted'), undo);
                nav('/tarefas');
              },
            },
          ]}
        />
      </div>
      <Card className="flex flex-col gap-4">
        <Field label={t('common.name')}>{(fid) => <AutoInput id={fid} value={p.name} onSave={(v) => v.trim() && set({ name: v.trim() })} />}</Field>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={t('common.area')}>{(fid) => <AreaSelect id={fid} value={p.areaId} onChange={(v) => v && set({ areaId: v })} />}</Field>
          <Field label={t('detail.status')}>
            {(fid) => <Select id={fid} value={p.status} onChange={(e) => set({ status: e.target.value as Project['status'] })} options={(['active', 'done', 'paused', 'cancelled'] as const).map((s) => ({ value: s, label: t(`projects.status.${s}`) }))} />}
          </Field>
          <Field label={t('projects.start')}>{(fid) => <Input id={fid} type="date" value={p.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} />}</Field>
          <Field label={t('projects.end')}>{(fid) => <Input id={fid} type="date" value={p.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} />}</Field>
        </div>
        <Field label={t('projects.objective')}>{(fid) => <AutoInput id={fid} multiline value={p.objective} onSave={(v) => set({ objective: v })} />}</Field>
      </Card>

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{t('projects.steps')}</h2>
          <Button variant="soft" onClick={() => open('task', { projectId: p.id, date: null })}>
            <Plus size={18} aria-hidden />
            {t('projects.addStep')}
          </Button>
        </div>
        {steps.length > 0 && <Bar pct={(done / steps.length) * 100} label={t('projects.progress', { done, total: steps.length })} />}
        {criticalLate(steps, today, now) && (
          <p className="inline-flex items-center gap-1 text-[15px] font-semibold text-danger-dark">
            <CircleAlert size={16} aria-hidden />
            {t('projects.criticalLate')}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {steps.map((s) => (
            <li key={s.id} className="flex flex-col gap-1">
              <TaskCard task={s} ctx={ctx} showDate />
              <div className="pl-3">
                <Toggle label={`${t('fields.critical')}: ${s.title}`} checked={s.critical} onChange={(v) => patchTask(s.id, { critical: v })} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {steps.length > 0 && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold">{t('projects.timeline')}</h2>
          <Timeline project={p} steps={steps} />
        </Card>
      )}

      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('projects.resources')}</h2>
        <ListEditor label={t('projects.resource')} placeholder={t('projects.resourcePh')} items={p.resources} onChange={(resources) => set({ resources })} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('projects.obstacles')}</h2>
        <ul className="flex flex-col gap-2">
          {p.obstacles.map((o) => (
            <li key={o.id} className="grid grid-cols-1 gap-2 rounded-[8px] border border-line p-2 sm:grid-cols-[1fr_1fr_auto]">
              <AutoInput aria-label={t('projects.obstacle')} value={o.obstacle} onSave={(v) => set({ obstacles: p.obstacles.map((x) => (x.id === o.id ? { ...x, obstacle: v } : x)) })} />
              <AutoInput aria-label={t('projects.plan')} value={o.plan} onSave={(v) => set({ obstacles: p.obstacles.map((x) => (x.id === o.id ? { ...x, plan: v } : x)) })} />
              <IconButton label={t('common.delete')} onClick={() => set({ obstacles: p.obstacles.filter((x) => x.id !== o.id) })}>
                <Trash2 size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            if (!obs.obstacle.trim()) return;
            void set({ obstacles: [...p.obstacles, { id: uuid(), obstacle: obs.obstacle.trim(), plan: obs.plan.trim() }] });
            setObs({ obstacle: '', plan: '' });
          }}
        >
          <Input aria-label={t('projects.obstacle')} placeholder={t('projects.obstaclePh')} value={obs.obstacle} onChange={(e) => setObs({ ...obs, obstacle: e.target.value })} />
          <Input aria-label={t('projects.plan')} placeholder={t('projects.planPh')} value={obs.plan} onChange={(e) => setObs({ ...obs, plan: e.target.value })} />
          <Button type="submit" variant="soft">
            <Plus size={18} aria-hidden />
            {t('common.add')}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('projects.diary')}</h2>
        <Field label={fmtDate(today, { weekday: 'long', day: 'numeric', month: 'long' })}>
          {(fid) => <AutoInput id={fid} multiline placeholder={t('projects.diaryPh')} value={note?.text ?? ''} onSave={(v) => set({ diary: [...p.diary.filter((d) => d.date !== today), ...(v.trim() ? [{ date: today, text: v }] : [])].sort((a, b) => (a.date < b.date ? -1 : 1)) })} />}
        </Field>
        <ul className="flex flex-col gap-2">
          {p.diary
            .filter((d) => d.date !== today)
            .reverse()
            .map((d) => (
              <li key={d.date} className="rounded-[8px] border border-line p-2">
                <p className="text-[13px] font-semibold text-muted">{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <p className="text-base whitespace-pre-wrap">{d.text}</p>
              </li>
            ))}
        </ul>
      </Card>

      <Sheet open={askDelete} onClose={() => setAskDelete(false)} title={t('projects.deleteTitle')}>
        <div className="flex flex-col gap-2">
          <Button variant="danger" onClick={() => del(true)}>
            {t('projects.deleteWithSteps')}
          </Button>
          <Button onClick={() => del(false)}>{t('projects.keepSteps')}</Button>
        </div>
      </Sheet>
    </div>
  );
}
