import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlarmClock, Car, Check, CircleAlert, Flag, MapPin, Pause, Play, Repeat, Zap, CircleHelp } from 'lucide-react';
import type { Area, Place, Task, TimeEntry } from '@/db/types';
import { taskTimer } from '@/lib/domain/timeEntries';
import { canArrive } from '@/lib/domain/misc';
import { fmtDate, fmtDateTime, fmtMinutes, fmtTime } from '@/lib/format';
import { arrive, duplicateTask, pauseTask } from '@/state/actions/tasks';
import { ItemMenu, SwipeRow, cx, useToast, type MenuItem } from './ui';
import { isRecurring, useFlows } from './flows';
import type { ReactNode } from 'react';

export interface CardContext {
  areas: Area[];
  places: Place[];
  entries: TimeEntry[];
  now: string;
}

export function itemHref(id: string): string {
  return `/tarefa/${encodeURIComponent(id)}`;
}

export function TaskCard({ task, ctx, showStart = false, extraMenu = [], warn, badge, showDate = false, dragHandle }: { task: Task; ctx: CardContext; showStart?: boolean; extraMenu?: MenuItem[]; warn?: string | null; badge?: ReactNode; showDate?: boolean; dragHandle?: ReactNode }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const flows = useFlows();
  const toast = useToast();
  const area = ctx.areas.find((a) => a.id === task.areaId);
  const place = ctx.places.find((p) => p.id === task.locationId);
  const timer = taskTimer(task, ctx.entries, ctx.now);
  const done = task.kind === 'task' ? task.status === 'done' : task.eventStatus === 'ontime' || task.eventStatus === 'late';
  const color = area?.color ?? 6;
  const time = task.plannedStart ? `${task.plannedStart}${task.plannedEnd ? `–${task.plannedEnd}` : ''}` : null;
  const menu: MenuItem[] = [
    { label: t('common.edit'), onSelect: () => nav(itemHref(task.id)) },
    ...(!isRecurring(task)
      ? [
          {
            label: t('common.duplicate'),
            onSelect: async () => {
              await duplicateTask(task.id);
              toast(t('fields.duplicated'));
            },
          },
        ]
      : []),
    ...extraMenu,
    { label: t('common.delete'), danger: true, onSelect: () => void flows.remove(task) },
  ];

  const body = (
    <div className={cx('relative flex items-stretch gap-2 rounded-[12px] bg-card py-2 pr-1 pl-3 shadow-[var(--shadow-soft)]')}>
      <span className="absolute inset-y-2 left-0 w-1.5 rounded-r-full" style={{ background: `var(--c${color})` }} aria-hidden />
      {dragHandle}
      {task.kind === 'task' ? (
        <button
          type="button"
          aria-label={done ? t('today.doneLabel', { name: task.title }) : t('today.completeLabel', { name: task.title })}
          aria-pressed={done}
          disabled={done}
          onClick={() => flows.complete(task)}
          className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-full"
        >
          <span className={cx('flex h-7 w-7 items-center justify-center rounded-full border-2', done ? 'border-success bg-success text-white' : 'border-[#9AA1B1]')}>{done && <Check size={16} aria-hidden />}</span>
        </button>
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center self-center text-muted" aria-hidden>
          <AlarmClock size={20} />
        </span>
      )}
      <button type="button" onClick={() => nav(itemHref(task.id))} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left">
        <span className={cx('text-base font-semibold break-words', done && 'line-through decoration-1')}>{task.title}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted">
          {area && <span style={{ color: `var(--c${color}-dark)` }} className="font-semibold">{area.name}</span>}
          {showDate && task.date && <span>{fmtDate(task.date)}</span>}
          {time ? <span>{time}</span> : task.kind === 'task' && <span>{fmtMinutes(task.plannedMinutes || 30)}</span>}
          {timer.realMinutes > 0 && task.kind === 'task' && <span>{t('today.realShort', { t: fmtMinutes(timer.realMinutes) })}</span>}
          {task.deadline && (
            <span className="inline-flex items-center gap-0.5">
              <Flag size={13} aria-hidden />
              {t('fields.deadlineShort', { d: fmtDateTime(task.deadline) })}
            </span>
          )}
          {place && (
            <span className="inline-flex items-center gap-0.5">
              <MapPin size={13} aria-hidden />
              {place.name}
            </span>
          )}
          {task.travelMinutes > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Car size={13} aria-hidden />
              {t('today.travelShort', { n: task.travelMinutes })}
            </span>
          )}
          {isRecurring(task) && (
            <span className="inline-flex items-center gap-0.5">
              <Repeat size={13} aria-hidden />
              {t('today.repeats')}
            </span>
          )}
          {task.hard && (
            <span className="inline-flex items-center gap-0.5">
              <CircleHelp size={13} aria-hidden />
              {t('fields.hardShort')}
            </span>
          )}
          {task.kind === 'task' && task.status === 'delegated' && <span>{t('status.delegated')}</span>}
          {task.kind === 'task' && task.status === 'refused' && <span>{t('status.refused')}</span>}
          {task.kind === 'event' && task.eventStatus && <span>{t(`eventStatus.${task.eventStatus}`)}</span>}
          {task.kind === 'event' && task.arrivedAt && <span>{t('today.arrivedAt', { t: fmtTime(task.arrivedAt) })}</span>}
          {warn && (
            <span className="inline-flex items-center gap-0.5 font-semibold text-warning-dark">
              <CircleAlert size={13} aria-hidden />
              {warn}
            </span>
          )}
          {badge}
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-0.5 self-center">
        {showStart && task.kind === 'task' && !done && task.status === 'pending' && (
          timer.state === 'running' ? (
            <button type="button" onClick={() => pauseTask(task.id)} className="inline-flex min-h-11 items-center gap-1 rounded-[8px] bg-primary-soft px-3 text-[15px] font-semibold text-primary-dark">
              <Pause size={16} aria-hidden />
              {t('today.pause')}
            </button>
          ) : (
            <button type="button" onClick={() => flows.start(task)} className="inline-flex min-h-11 items-center gap-1 rounded-[8px] bg-primary-soft px-3 text-[15px] font-semibold text-primary-dark">
              <Play size={16} aria-hidden />
              {timer.state === 'paused' ? t('today.resume') : t('today.start')}
            </button>
          )
        )}
        {showStart && task.kind === 'event' && canArrive(task, ctx.now) && (
          <button
            type="button"
            onClick={async () => {
              const undo = await arrive(task.id);
              toast(t('today.arrived'), undo);
            }}
            className="inline-flex min-h-11 items-center gap-1 rounded-[8px] bg-primary px-3 text-[15px] font-semibold text-on-primary"
          >
            <Zap size={16} aria-hidden />
            {t('today.arrive')}
          </button>
        )}
        <ItemMenu items={menu} />
      </div>
    </div>
  );
  return <SwipeRow onDelete={() => void flows.remove(task)}>{body}</SwipeRow>;
}
