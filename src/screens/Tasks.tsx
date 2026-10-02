import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, CircleAlert, FolderKanban, GripVertical, ListChecks, Search } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/db';
import type { Project, Task, TriState } from '@/db/types';
import { useCreate } from '@/components/CreateMenu';
import { TaskCard, type CardContext } from '@/components/TaskCard';
import { Bar, Button, Card, EmptyState, Field, IconButton, Input, PageTitle, Segmented, Select, Sheet, TextArea, cx, useToast } from '@/components/ui';
import { useDayData, type DayData } from './today/useToday';
import { useNow } from '@/state/data';
import { expandItems } from '@/lib/domain/recurrence';
import { addDays, dateKey, toDate, weekStart } from '@/lib/time';
import { fmtDate } from '@/lib/format';
import { patchTask } from '@/state/actions/tasks';
import { undoable } from '@/db/repo';
import { sortItems } from './today/PlanList';

type Filter = 'today' | 'week' | 'someday' | 'late' | 'delegated' | 'done';
const FILTERS: Filter[] = ['today', 'week', 'someday', 'late', 'delegated', 'done'];

export function isLate(t: Task, today: string, now: string): boolean {
  if (t.kind !== 'task' || t.status !== 'pending') return false;
  return (!!t.date && t.date < today) || (!!t.deadline && toDate(t.deadline).getTime() < toDate(now).getTime());
}

function ListView({ data, ctx, now }: { data: DayData; ctx: CardContext; now: string }) {
  const { t } = useTranslation();
  const { open } = useCreate();
  const [filter, setFilter] = useState<Filter>('today');
  const [area, setArea] = useState('');
  const [q, setQ] = useState('');
  const today = dateKey(now);
  const items = useMemo(() => {
    const real = data.raw.filter((x) => !x.deleted_at && x.kind === 'task' && !(x.repeat && !x.seriesId) && !x.skipped);
    let list: Task[];
    switch (filter) {
      case 'today':
        list = expandItems(data.raw, today, today).filter((x) => x.kind === 'task');
        break;
      case 'week': {
        const ws = weekStart(today);
        list = expandItems(data.raw, ws, addDays(ws, 6)).filter((x) => x.kind === 'task');
        break;
      }
      case 'someday':
        list = real.filter((x) => !x.date && x.status === 'pending');
        break;
      case 'late':
        list = real.filter((x) => isLate(x, today, now));
        break;
      case 'delegated':
        list = real.filter((x) => x.status === 'delegated');
        break;
      case 'done':
        list = real.filter((x) => x.status === 'done').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
        break;
    }
    if (area) list = list.filter((x) => x.areaId === area);
    if (q.trim()) list = list.filter((x) => x.title.toLowerCase().includes(q.trim().toLowerCase()) || x.notes.toLowerCase().includes(q.trim().toLowerCase()));
    return filter === 'done' ? list : [...list].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || (a.plannedStart ?? '99').localeCompare(b.plannedStart ?? '99'));
  }, [data, filter, area, q, today, now]);

  return (
    <div className="flex flex-col gap-3">
      <div role="radiogroup" aria-label={t('tasks.filter')} className="flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f} type="button" role="radio" aria-checked={filter === f} onClick={() => setFilter(f)} className={cx('min-h-11 shrink-0 rounded-full border px-4 text-[15px] font-semibold', filter === f ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-card')}>
            {t(`tasks.filters.${f}`)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select aria-label={t('common.area')} value={area} onChange={(e) => setArea(e.target.value)} options={[{ value: '', label: t('tasks.allAreas') }, ...data.areas.map((a) => ({ value: a.id, label: a.name }))]} />
        <div className="relative">
          <Search size={18} aria-hidden className="absolute top-3.5 left-3 text-muted" />
          <Input aria-label={t('tasks.search')} placeholder={t('tasks.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
        </div>
      </div>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((x) => (
            <li key={x.id}>
              <TaskCard task={x} ctx={ctx} showStart={filter === 'today'} showDate={filter !== 'today'} />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<ListChecks size={32} />} text={t('tasks.empty')} action={t('today.addTask')} onAction={() => open('task', filter === 'today' ? { date: today } : filter === 'someday' ? { date: null } : {})} />
      )}
    </div>
  );
}

// ---------------- Matrix ----------------
type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';
export const QUADRANTS: { q: Quadrant; urgent: TriState; important: TriState }[] = [
  { q: 'do', urgent: 'yes', important: 'yes' },
  { q: 'schedule', urgent: 'no', important: 'yes' },
  { q: 'delegate', urgent: 'yes', important: 'no' },
  { q: 'eliminate', urgent: 'no', important: 'no' },
];

export function quadrantOf(t: Pick<Task, 'urgent' | 'important'>): Quadrant | 'unclassified' {
  if (t.urgent === 'unset' || t.important === 'unset') return 'unclassified';
  return QUADRANTS.find((x) => x.urgent === t.urgent && x.important === t.important)!.q;
}

export function weekTasks(raw: Task[], ws: string): Task[] {
  return expandItems(raw, ws, addDays(ws, 6)).filter((x) => x.kind === 'task');
}

function DraggableCard({ task, ctx, onHard }: { task: Task; ctx: CardContext; onHard: (t: Task) => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({ id: task.id });
  const move = (q: (typeof QUADRANTS)[number]) => patchTask(task.id, { urgent: q.urgent, important: q.important });
  return (
    <li ref={setNodeRef} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)` } : undefined} className={cx(isDragging && 'relative z-20 opacity-90')}>
      <TaskCard
        task={task}
        ctx={ctx}
        showDate
        dragHandle={
          <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={t('today.move', { name: task.title })} className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-center text-[#9AA1B1]">
            <GripVertical size={18} aria-hidden />
          </button>
        }
        extraMenu={[...QUADRANTS.filter((q) => quadrantOf(task) !== q.q).map((q) => ({ label: t('matrix.moveTo', { q: t(`matrix.${q.q}`) }), onSelect: () => void move(q) })), { label: t('matrix.markHard'), onSelect: () => onHard(task) }]}
      />
    </li>
  );
}

function Zone({ id, title, sub, count, children, className }: { id: string; title: string; sub?: string; count: number; children: React.ReactNode; className?: string }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section ref={setNodeRef} aria-label={title} className={cx('flex min-h-32 flex-col gap-2 rounded-[12px] border border-line p-3 transition', isOver ? 'bg-primary-soft/50' : 'bg-card/70', className)} data-testid={`zone-${id}`}>
      <h3 className="flex items-baseline justify-between gap-2">
        <span className="text-base font-bold">
          {title}
          {sub && <span className="ml-2 text-[13px] font-normal text-muted">{sub}</span>}
        </span>
        <span className="text-[13px] font-semibold text-muted">{t('matrix.count', { count })}</span>
      </h3>
      {children}
    </section>
  );
}

function MatrixView({ data, ctx, now }: { data: DayData; ctx: CardContext; now: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [ws, setWs] = useState(weekStart(dateKey(now)));
  const [hard, setHard] = useState<Task | null>(null);
  const [why, setWhy] = useState('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor));
  const tasks = weekTasks(data.raw, ws);
  const by = (q: string) => sortItems(tasks.filter((x) => quadrantOf(x) === q));
  const onEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const q = QUADRANTS.find((x) => x.q === e.over!.id);
    if (!q) return;
    const { undo } = await undoable(async () => {
      await patchTask(String(e.active.id), { urgent: q.urgent, important: q.important });
    });
    toast(t('today.moved'), undo);
  };
  const list = (q: string) => (
    <ul className="flex flex-col gap-2">
      {by(q).map((x) => (
        <DraggableCard key={x.id} task={x} ctx={ctx} onHard={(tk) => (setHard(tk), setWhy(tk.hardReason))} />
      ))}
    </ul>
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <IconButton label={t('cal.prev')} onClick={() => setWs(addDays(ws, -7))}>
          <ChevronLeft />
        </IconButton>
        <p className="text-base font-semibold">
          {fmtDate(ws)} – {fmtDate(addDays(ws, 6))} · {t('matrix.total', { count: tasks.length })}
        </p>
        <IconButton label={t('cal.next')} onClick={() => setWs(addDays(ws, 7))}>
          <ChevronRight />
        </IconButton>
      </div>
      <DndContext sensors={sensors} onDragEnd={onEnd}>
        {by('unclassified').length > 0 && (
          <Zone id="unclassified" title={t('matrix.unclassified')} count={by('unclassified').length}>
            {list('unclassified')}
          </Zone>
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <p className="hidden text-center text-[13px] font-bold text-muted lg:block">{t('fields.urgent')}</p>
          <p className="hidden text-center text-[13px] font-bold text-muted lg:block">{t('matrix.notUrgent')}</p>
          {QUADRANTS.map((q) => (
            <Zone key={q.q} id={q.q} title={t(`matrix.${q.q}`)} sub={t(`matrix.${q.q}Sub`)} count={by(q.q).length}>
              {list(q.q)}
            </Zone>
          ))}
        </div>
      </DndContext>
      <Sheet
        open={!!hard}
        onClose={() => setHard(null)}
        title={t('matrix.markHard')}
        footer={
          <>
            <Button onClick={() => setHard(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={async () => {
                await patchTask(hard!.id, { hard: true, hardReason: why });
                setHard(null);
              }}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('fields.hardReason')}>{(id) => <TextArea id={id} value={why} onChange={(e) => setWhy(e.target.value)} />}</Field>
      </Sheet>
    </div>
  );
}

// ---------------- Projects ----------------
export function projectSteps(p: Project, raw: Task[]): Task[] {
  return raw.filter((x) => x.projectId === p.id && !x.deleted_at && !(x.repeat && !x.seriesId));
}

export function criticalLate(steps: Task[], today: string, now: string): boolean {
  return steps.some((s) => s.critical && s.status !== 'done' && ((s.date && s.date < today) || (s.deadline && toDate(s.deadline) < toDate(now))));
}

function ProjectsView({ data, now }: { data: DayData; now: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { open } = useCreate();
  const projects = useLiveQuery(async () => (await db.projects.toArray()).filter((p) => !p.deleted_at).sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? '')), []) ?? [];
  if (!projects.length) return <EmptyState icon={<FolderKanban size={32} />} text={t('projects.empty')} action={t('projects.add')} onAction={() => open('project')} />;
  const today = dateKey(now);
  return (
    <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {projects.map((p) => {
        const steps = projectSteps(p, data.raw);
        const done = steps.filter((s) => s.status === 'done').length;
        const area = data.areas.find((a) => a.id === p.areaId);
        const alert = criticalLate(steps, today, now);
        return (
          <li key={p.id}>
            <button type="button" onClick={() => nav(`/projeto/${p.id}`)} className="w-full text-left">
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-base font-bold">{p.name}</span>
                  <span className="text-[13px] font-semibold text-muted">{t(`projects.status.${p.status}`)}</span>
                </div>
                <p className="text-[13px] text-muted">
                  {area && <span style={{ color: `var(--c${area.color}-dark)` }} className="font-semibold">{area.name}</span>}
                  {p.startDate && ` · ${fmtDate(p.startDate)}`}
                  {p.endDate && ` – ${fmtDate(p.endDate)}`}
                </p>
                <Bar pct={steps.length ? (done / steps.length) * 100 : 0} label={t('projects.progress', { done, total: steps.length })} />
                <p className="text-[13px] text-muted">{t('projects.progress', { done, total: steps.length })}</p>
                {alert && (
                  <p className="inline-flex items-center gap-1 text-[13px] font-semibold text-danger-dark">
                    <CircleAlert size={14} aria-hidden />
                    {t('projects.criticalLate')}
                  </p>
                )}
              </Card>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Tasks() {
  const { t } = useTranslation();
  const now = useNow(30000);
  const data = useDayData();
  const [view, setView] = useState<'list' | 'matrix' | 'projects'>('list');
  if (!data) return null;
  const ctx = { areas: data.areas, places: data.places, entries: data.entries, now };
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageTitle>{t('nav.tasks')}</PageTitle>
      <Segmented
        label={t('tasks.view')}
        value={view}
        onChange={setView}
        options={[
          { value: 'list', label: t('tasks.list') },
          { value: 'matrix', label: t('tasks.matrix') },
          { value: 'projects', label: t('tasks.projects') },
        ]}
      />
      {view === 'list' && <ListView data={data} ctx={ctx} now={now} />}
      {view === 'matrix' && <MatrixView data={data} ctx={ctx} now={now} />}
      {view === 'projects' && <ProjectsView data={data} now={now} />}
    </div>
  );
}
