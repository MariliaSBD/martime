import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCorners, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Car, GripVertical } from 'lucide-react';
import type { EnergyBlock, Task } from '@/db/types';
import { demandingInLow, groupOf, outsideBlock, planGroups, type PlanGroup } from '@/lib/domain/energy';
import { patchTask } from '@/state/actions/tasks';
import { TaskCard, type CardContext } from '@/components/TaskCard';
import { cx, useToast } from '@/components/ui';
import { hhmmToMinutes, minutesToHHMM } from '@/lib/time';
import { undoable } from '@/db/repo';

export function sortItems(items: Task[]): Task[] {
  return [...items].sort((a, b) => a.order - b.order || (a.plannedStart ?? '99').localeCompare(b.plannedStart ?? '99') || a.created_at.localeCompare(b.created_at));
}

function SortableItem({ task, ctx, blocks }: { task: Task; ctx: CardContext; blocks: EnergyBlock[] }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const warn = outsideBlock(task, blocks) ? t('today.outsideBlock') : demandingInLow(task, blocks) ? t('today.demandingLow') : null;
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cx(isDragging && 'relative z-10 opacity-80')}>
      {task.travelMinutes > 0 && task.plannedStart && (
        <div className="mb-1 ml-3 flex items-center gap-2 rounded-[8px] border border-dashed border-line px-3 py-1.5 text-[13px] text-muted">
          <Car size={14} aria-hidden />
          {t('today.travelBlock', { n: task.travelMinutes, at: minutesToHHMM(hhmmToMinutes(task.plannedStart) - task.travelMinutes) })}
        </div>
      )}
      <TaskCard
        task={task}
        ctx={ctx}
        showStart
        warn={warn}
        dragHandle={
          <button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={t('today.move', { name: task.title })} className="flex w-6 shrink-0 cursor-grab touch-none items-center justify-center self-center text-[#9AA1B1]">
            <GripVertical size={18} aria-hidden />
          </button>
        }
      />
    </li>
  );
}

function GroupBox({ group, children, empty }: { group: PlanGroup; children: React.ReactNode; empty: boolean }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `group:${group.id}` });
  const title = group.name ?? t(group.id === 'none' ? 'today.noTime' : `today.${group.id.replace('seg:', '')}`);
  return (
    <section ref={setNodeRef} aria-label={title} className={cx('rounded-[12px] transition', isOver && 'bg-primary-soft/40', empty && 'border border-dashed border-line p-2')}>
      <h3 className="mb-1.5 flex flex-wrap items-baseline gap-2 text-base font-semibold">
        {title}
        {group.start && group.name && (
          <span className="text-[13px] font-normal text-muted-bg">
            {group.start}–{group.end}
            {group.level && ` · ${t('today.energyLevel', { level: t(`energy.${group.level}`) })}`}
          </span>
        )}
      </h3>
      {children}
    </section>
  );
}

/** 7.5: plan grouped by energy blocks; drag to reorder within a group or to move to another block. */
export function PlanList({ items, blocks, ctx }: { items: Task[]; blocks: EnergyBlock[]; ctx: CardContext }) {
  const toast = useToast();
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byGroup = new Map<string, Task[]>();
  for (const it of items) {
    const g = groupOf(it, blocks);
    byGroup.set(g, [...(byGroup.get(g) ?? []), it]);
  }
  const groups = planGroups(blocks, new Set(byGroup.keys()));

  const onEnd = async (e: DragEndEvent) => {
    setDragging(false);
    if (!e.over) return;
    const activeId = String(e.active.id);
    const overId = String(e.over.id);
    const from = groupOf(items.find((i) => i.id === activeId)!, blocks);
    const to = overId.startsWith('group:') ? overId.slice(6) : groupOf(items.find((i) => i.id === overId)!, blocks);
    const list = sortItems(byGroup.get(to) ?? []).filter((x) => x.id !== activeId);
    const idx = overId.startsWith('group:') ? list.length : Math.max(0, list.findIndex((x) => x.id === overId));
    if (from === to && activeId === overId) return;
    const moved = items.find((i) => i.id === activeId)!;
    const fromIdx = sortItems(byGroup.get(from) ?? []).findIndex((x) => x.id === activeId);
    const insertAt = from === to && fromIdx < idx ? idx + 1 : idx;
    list.splice(Math.min(insertAt, list.length), 0, moved);
    const { undo } = await undoable(async () => {
      for (let i = 0; i < list.length; i++) {
        const patch: Partial<Task> = { order: i };
        if (list[i].id === activeId && from !== to) patch.energyBlockId = blocks.some((b) => b.id === to) ? to : null;
        if (list[i].order !== i || patch.energyBlockId !== undefined) await patchTask(list[i].id, patch);
      }
    });
    toast(t('today.moved'), undo);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={onEnd}>
      <div className="flex flex-col gap-4">
        {groups.map((g) => {
          const list = sortItems(byGroup.get(g.id) ?? []);
          if (!list.length && !(dragging && blocks.some((b) => b.id === g.id))) return null;
          return (
            <GroupBox key={g.id} group={g} empty={!list.length}>
              <SortableContext items={list.map((x) => x.id)} strategy={verticalListSortingStrategy}>
                <ul className="flex flex-col gap-2">
                  {list.map((x) => (
                    <SortableItem key={x.id} task={x} ctx={ctx} blocks={blocks} />
                  ))}
                </ul>
              </SortableContext>
            </GroupBox>
          );
        })}
      </div>
    </DndContext>
  );
}
