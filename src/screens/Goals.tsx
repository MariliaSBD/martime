import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Star, Target } from 'lucide-react';
import { db } from '@/db/db';
import type { Goal } from '@/db/types';
import { update } from '@/db/repo';
import { useCreate } from '@/components/CreateMenu';
import { Card, EmptyState, PageTitle, Ring, cx } from '@/components/ui';
import { expectedAt, goalProgress, pace, type GoalContext } from '@/lib/domain/goals';
import { dateKey, nowIso } from '@/lib/time';
import { fmtDate, fmtNumber } from '@/lib/format';
import type { TFunction } from 'i18next';

export function useGoalContext(): GoalContext | undefined {
  return useLiveQuery(async () => {
    const [tasks, entries, goals] = await Promise.all([db.tasks.toArray(), db.timeEntries.toArray(), db.goals.toArray()]);
    return { tasks: tasks.filter((x) => !x.deleted_at), entries: entries.filter((x) => !x.deleted_at), goals: goals.filter((x) => !x.deleted_at), now: nowIso() };
  }, []);
}

export function paceText(goal: Goal, ctx: GoalContext, t: TFunction): string {
  const p = goalProgress(goal, ctx);
  const today = dateKey(ctx.now);
  const exp = expectedAt(goal, p.target, today > goal.dueDate ? goal.dueDate : today);
  const r = pace(p.value, exp, p.target);
  if (r.status === 'on') return t('goals.onPace');
  return t(r.status === 'above' ? 'goals.above' : 'goals.below', { n: fmtNumber(r.n) });
}

function GoalRow({ goal, ctx }: { goal: Goal; ctx: GoalContext }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id });
  const p = goalProgress(goal, ctx);
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && 'relative z-10')}>
      <Card className="flex items-center gap-3">
        <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={t('today.move', { name: goal.what })} className="flex h-11 w-6 shrink-0 cursor-grab touch-none items-center justify-center text-[#9AA1B1]">
          <GripVertical size={18} aria-hidden />
        </button>
        <Ring size={64} pct={p.pct} label={t('goals.progressLabel', { p: p.pct })} />
        <button type="button" onClick={() => nav(`/objetivo/${goal.id}`)} className="flex min-h-11 min-w-0 flex-1 flex-col text-left">
          <span className="flex items-center gap-1 text-base font-bold">
            {goal.isMain && <Star size={16} aria-hidden className="shrink-0 fill-current text-primary-dark" />}
            {goal.isMain && <span className="sr-only">{t('goals.main')}</span>}
            {goal.what}
          </span>
          <span className="text-[13px] text-muted">
            {fmtNumber(p.value)} / {fmtNumber(p.target)} {goal.unit} · {t('goals.untilShort', { d: fmtDate(goal.dueDate) })}
          </span>
          {goal.status === 'active' ? <span className="text-[13px] font-semibold text-ink">{paceText(goal, ctx, t)}</span> : <span className="text-[13px] font-semibold">{t(`goals.status.${goal.status}`)}</span>}
        </button>
      </Card>
    </li>
  );
}

export default function Goals() {
  const { t } = useTranslation();
  const { open } = useCreate();
  const ctx = useGoalContext();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  if (!ctx) return null;
  const sorted = [...ctx.goals].sort((a, b) => a.order - b.order);
  const active = sorted.filter((g) => g.status === 'active' || g.status === 'paused');
  const closed = sorted.filter((g) => g.status === 'done' || g.status === 'abandoned');
  const onEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = active.map((g) => g.id);
    const next = arrayMove(active, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id)));
    for (let i = 0; i < next.length; i++) if (next[i].order !== i) await update('goals', next[i].id, { order: i });
  };
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageTitle>{t('nav.goals')}</PageTitle>
      {!sorted.length && <EmptyState icon={<Target size={32} />} text={t('goals.empty')} action={t('goals.add')} onAction={() => open('goal')} />}
      {active.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onEnd}>
          <SortableContext items={active.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-2" aria-label={t('goals.priority')}>
              {active.map((g) => (
                <GoalRow key={g.id} goal={g} ctx={ctx} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      {closed.length > 0 && (
        <>
          <h2 className="mt-2 text-lg font-semibold">{t('goals.closed')}</h2>
          <DndContext>
            <SortableContext items={closed.map((g) => g.id)}>
              <ul className="flex flex-col gap-2">
                {closed.map((g) => (
                  <GoalRow key={g.id} goal={g} ctx={ctx} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
