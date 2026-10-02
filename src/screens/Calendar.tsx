import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { ChevronLeft, ChevronRight, Flag, Star } from 'lucide-react';
import { db } from '@/db/db';
import type { ImportantDate, Task, TimeEntry } from '@/db/types';
import { useCreate, useCreateContext } from '@/components/CreateMenu';
import { Button, IconButton, PageTitle, Ring, Segmented, cx, useToast } from '@/components/ui';
import { EntrySheet } from '@/components/EntrySheet';
import { itemHref } from '@/components/TaskCard';
import { useDayData, type DayData } from './today/useToday';
import { useNow } from '@/state/data';
import { expandItems } from '@/lib/domain/recurrence';
import { progressOf } from '@/lib/domain/progress';
import { gaps } from '@/lib/domain/timeEntries';
import { holidayOn } from '@/lib/domain/holidays';
import { occurrencesOf } from '@/lib/domain/importantDates';
import { HOLIDAY, NEUTRAL, PROGRESS, progressColor } from '@/lib/colors';
import { addDays, addMonths, dateKey, daysInMonth, dayEnd, dayStart, hhmmToMinutes, isoWeekday, minutesBetween, minutesToHHMM, monthStart, toDate, weekStart, type DateKey } from '@/lib/time';
import { fmtDate, fmtLongDate, fmtMonth, fmtTime, weekdayName } from '@/lib/format';
import { patchTask } from '@/state/actions/tasks';
import { syncAllTodoTasks } from '@/state/actions/importantDates';
import { undoable } from '@/db/repo';
import { CLASS_COLORS } from './SessionDetail';

type View = 'year' | 'month' | 'week' | 'day';
const PX_PER_MIN = 0.8; // 48 px per hour

function useCalendarData(data: DayData | undefined, from: DateKey, to: DateKey) {
  const idates = useLiveQuery(async () => (await db.importantDates.toArray()).filter((d) => !d.deleted_at), []) ?? [];
  return useMemo(() => {
    if (!data) return null;
    const items = expandItems(data.raw, from, to);
    const byDate = new Map<DateKey, Task[]>();
    for (const it of items) byDate.set(it.date!, [...(byDate.get(it.date!) ?? []), it]);
    const deadlines = new Map<DateKey, Task[]>();
    for (const t of data.raw) if (!t.deleted_at && t.deadline && t.status !== 'done') {
      const k = dateKey(t.deadline);
      if (k >= from && k <= to) deadlines.set(k, [...(deadlines.get(k) ?? []), t]);
    }
    const important = new Map<DateKey, ImportantDate[]>();
    for (const d of idates) for (const k of occurrencesOf(d, from, to)) important.set(k, [...(important.get(k) ?? []), d]);
    return { byDate, deadlines, important };
  }, [data, idates, from, to]);
}

export function dayPct(data: DayData, date: DateKey, items: Task[]): number | null {
  const frozen = data.days.find((d) => d.date === date && d.endedAt && d.frozen)?.frozen;
  return frozen ? frozen.pct : progressOf(items).pct;
}

function HolidayTag({ date }: { date: DateKey }) {
  const { t } = useTranslation();
  const h = holidayOn(date);
  if (!h) return null;
  return (
    <span className="inline-block rounded px-1.5 text-[13px] leading-5 font-semibold text-white" style={{ background: HOLIDAY[h.kind] }} title={t(`holidays.${h.key}`)}>
      {t(`holidays.${h.kind}`)}
    </span>
  );
}

function MarksList({ from, to, cal }: { from: DateKey; to: DateKey; cal: NonNullable<ReturnType<typeof useCalendarData>> }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const rows: ReactNode[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const h = holidayOn(d);
    if (h)
      rows.push(
        <li key={`h${d}`} className="flex flex-wrap items-center gap-2 text-[15px]">
          <span className="w-16 font-semibold">{fmtDate(d)}</span>
          <span>{t(`holidays.${h.key}`)}</span>
          <HolidayTag date={d} />
        </li>,
      );
    for (const x of cal.important.get(d) ?? [])
      rows.push(
        <li key={`i${x.id}${d}`} className="flex flex-wrap items-center gap-2 text-[15px]">
          <span className="w-16 font-semibold">{fmtDate(d)}</span>
          <button type="button" onClick={() => nav(`/data/${x.id}`)} className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary-dark">
            <Star size={14} aria-hidden />
            {x.name}
          </button>
        </li>,
      );
  }
  if (!rows.length) return null;
  return <ul className="flex flex-col gap-1 rounded-[12px] bg-card p-3 shadow-[var(--shadow-soft)]">{rows}</ul>;
}

// ---------------- Year ----------------
function YearView({ year, data, cal, today, onOpenDay }: { year: number; data: DayData; cal: NonNullable<ReturnType<typeof useCalendarData>>; today: DateKey; onOpenDay: (d: DateKey) => void }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
        const first = `${year}-${String(m).padStart(2, '0')}-01`;
        const lead = isoWeekday(first) - 1;
        return (
          <section key={m} aria-label={fmtMonth(year, m)} className="rounded-[12px] bg-card p-3 shadow-[var(--shadow-soft)]">
            <h3 className="mb-2 text-base font-semibold">{fmtMonth(year, m)}</h3>
            <div className="grid grid-cols-7 gap-1 text-center">
              {[1, 2, 3, 4, 5, 6, 7].map((w) => (
                <span key={w} className="text-[13px] font-semibold text-muted" aria-hidden>
                  {weekdayName(w, 'narrow')}
                </span>
              ))}
              {Array.from({ length: lead }, (_, i) => (
                <span key={`l${i}`} />
              ))}
              {Array.from({ length: daysInMonth(year, m) }, (_, i) => {
                const d = addDays(first, i);
                const items = cal.byDate.get(d) ?? [];
                const future = d > today;
                const pct = future ? null : dayPct(data, d, items);
                const bg = progressColor(pct, future);
                const h = holidayOn(d);
                const label = `${fmtLongDate(d)}: ${future ? t('cal.future') : pct === null ? t('common.noData') : `${pct}%`}${h ? ` · ${t(`holidays.${h.key}`)} (${t(`holidays.${h.kind}`)})` : ''}${cal.deadlines.has(d) ? ` · ${t('cal.deadline')}` : ''}`;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onOpenDay(d)}
                    aria-label={label}
                    title={label}
                    data-date={d}
                    data-color={bg}
                    className="relative flex aspect-square min-h-7 items-center justify-center rounded-[6px] text-[13px] font-semibold text-ink"
                    style={{ background: bg, border: h ? `2px solid ${HOLIDAY[h.kind]}` : future ? `1px solid ${NEUTRAL.line}` : '1px solid transparent', outline: d === today ? '2px solid var(--primary)' : undefined }}
                  >
                    {i + 1}
                    {cal.deadlines.has(d) && <span className="absolute right-0.5 bottom-0.5 h-1.5 w-1.5 rounded-full bg-ink" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="col-span-full flex flex-wrap gap-3 text-[13px]" aria-label={t('cal.legend')}>
        {[
          [PROGRESS.green, '≥ 80%'],
          [PROGRESS.yellow, '60–79%'],
          [PROGRESS.orange, '40–59%'],
          [PROGRESS.red, '< 40%'],
          [PROGRESS.beige, t('cal.noItems')],
        ].map(([c, l]) => (
          <span key={l} className="inline-flex items-center gap-1">
            <span className="h-4 w-4 rounded" style={{ background: c }} aria-hidden />
            {l}
          </span>
        ))}
        <span className="inline-flex items-center gap-1">
          <span className="h-4 w-4 rounded border-2" style={{ borderColor: HOLIDAY.national }} aria-hidden />
          {t('holidays.national')}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-4 w-4 rounded border-2" style={{ borderColor: HOLIDAY.lisbon }} aria-hidden />
          {t('holidays.lisbon')}
        </span>
      </div>
    </div>
  );
}

// ---------------- Month ----------------
function MonthView({ anchor, data, cal, today, onOpenDay }: { anchor: DateKey; data: DayData; cal: NonNullable<ReturnType<typeof useCalendarData>>; today: DateKey; onOpenDay: (d: DateKey) => void }) {
  const { t } = useTranslation();
  const ms = monthStart(anchor);
  const start = weekStart(ms);
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const rows = days[35].slice(0, 7) === ms.slice(0, 7) ? 6 : 5;
  return (
    <div className="grid grid-cols-7 gap-1">
      {[1, 2, 3, 4, 5, 6, 7].map((w) => (
        <span key={w} className="pb-1 text-center text-[13px] font-semibold text-muted">
          {weekdayName(w, 'short')}
        </span>
      ))}
      {days.slice(0, rows * 7).map((d) => {
        const items = cal.byDate.get(d) ?? [];
        const colors = [...new Set(items.map((x) => data.areas.find((a) => a.id === x.areaId)?.color ?? 6))];
        const other = d.slice(0, 7) !== ms.slice(0, 7);
        const dl = cal.deadlines.get(d) ?? [];
        const imp = cal.important.get(d) ?? [];
        const h = holidayOn(d);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onOpenDay(d)}
            aria-label={`${fmtLongDate(d)}: ${t('cal.items', { count: items.length })}${dl.length ? ` · ${t('cal.deadline')}` : ''}${h ? ` · ${t(`holidays.${h.key}`)}` : ''}${imp.length ? ` · ${imp.map((x) => x.name).join(', ')}` : ''}`}
            className={cx('flex min-h-20 flex-col items-start gap-0.5 rounded-[8px] border p-1 text-left', d === today ? 'border-primary' : 'border-line', other ? 'bg-transparent text-muted' : 'bg-card')}
            style={h ? { border: `2px solid ${HOLIDAY[h.kind]}` } : undefined}
          >
            <span className="text-[13px] font-bold">{Number(d.slice(8))}</span>
            <span className="flex items-center gap-1" aria-hidden>
              {imp.length > 0 && <Star size={13} className="text-primary-dark" />}
              {dl.length > 0 && <Flag size={13} className="text-danger-dark" />}
            </span>
            <span className="mt-auto flex flex-wrap items-center gap-0.5" aria-hidden>
              {colors.slice(0, 4).map((c) => (
                <span key={c} className="h-2 w-2 rounded-full" style={{ background: `var(--c${c})` }} />
              ))}
              {colors.length > 4 && <span className="text-[13px] font-semibold">+{colors.length - 4}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------- Week ----------------
function HourLabels() {
  return (
    <div className="relative w-10 shrink-0" style={{ height: 1440 * PX_PER_MIN }} aria-hidden>
      {Array.from({ length: 24 }, (_, h) => (
        <span key={h} className="absolute right-1 -translate-y-1/2 text-[13px] text-muted" style={{ top: h * 60 * PX_PER_MIN }}>
          {h ? `${String(h).padStart(2, '0')}:00` : ''}
        </span>
      ))}
    </div>
  );
}

function GridLines() {
  return (
    <>
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} className="pointer-events-none absolute inset-x-0 border-t border-line/70" style={{ top: h * 60 * PX_PER_MIN }} aria-hidden />
      ))}
    </>
  );
}

function Block({ task, color, onOpen, draggable = true, compact }: { task: Task; color: number; onOpen: () => void; draggable?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
  const start = hhmmToMinutes(task.plannedStart!);
  const dur = task.plannedEnd ? Math.max(15, hhmmToMinutes(task.plannedEnd) - start) : task.plannedMinutes || 30;
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label={`${task.title}, ${task.plannedStart}${task.plannedEnd ? `–${task.plannedEnd}` : ''}`}
      data-testid="cal-block"
      className={cx('absolute right-0.5 left-0.5 overflow-hidden rounded-[6px] border-l-4 px-1 text-left text-[13px] leading-tight font-semibold', isDragging && 'z-20 opacity-90 shadow-lg')}
      style={{
        top: start * PX_PER_MIN,
        height: Math.max(22, dur * PX_PER_MIN),
        background: `var(--c${color}-soft)`,
        color: `var(--c${color}-dark)`,
        borderColor: `var(--c${color})`,
        transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
        touchAction: 'none',
      }}
    >
      {task.title}
      {!compact && <span className="block font-normal">{task.plannedStart}</span>}
      {task.status === 'done' && <span className="sr-only">{t('status.done')}</span>}
    </button>
  );
}

function DayColumn({ date, children, onEmpty, label }: { date: DateKey; children: ReactNode; onEmpty: (time: string) => void; label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      data-testid={`col-${date}`}
      className={cx('relative min-w-0 flex-1 border-l border-line', isOver && 'bg-primary-soft/30')}
      style={{ height: 1440 * PX_PER_MIN }}
      onClick={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const min = Math.floor((e.clientY - rect.top) / PX_PER_MIN / 30) * 30;
        onEmpty(minutesToHHMM(Math.max(0, Math.min(1410, min))));
      }}
    >
      <GridLines />
      {children}
    </div>
  );
}

function WeekView({ anchor, data, cal, today, onOpenDay }: { anchor: DateKey; data: DayData; cal: NonNullable<ReturnType<typeof useCalendarData>>; today: DateKey; onOpenDay: (d: DateKey) => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const { open } = useCreate();
  const ws = weekStart(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const scroller = useRef<HTMLDivElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }), useSensor(KeyboardSensor));
  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * 60 * PX_PER_MIN });
  }, []);
  const all = days.flatMap((d) => cal.byDate.get(d) ?? []);
  const onEnd = async (e: DragEndEvent) => {
    const task = all.find((x) => x.id === e.active.id);
    if (!task || !task.plannedStart || !e.over) return;
    const newDate = String(e.over.id).replace('day:', '');
    const delta = Math.round(e.delta.y / PX_PER_MIN / 15) * 15;
    const start = Math.max(0, Math.min(1425, hhmmToMinutes(task.plannedStart) + delta));
    const dur = task.plannedEnd ? hhmmToMinutes(task.plannedEnd) - hhmmToMinutes(task.plannedStart) : null;
    if (newDate === task.date && delta === 0) return;
    const { undo } = await undoable(async () => {
      await patchTask(task.id, { date: newDate, plannedStart: minutesToHHMM(start), plannedEnd: dur !== null ? minutesToHHMM(Math.min(1439, start + dur)) : null });
    });
    toast(t('today.moved'), undo);
  };
  return (
    <DndContext sensors={sensors} onDragEnd={onEnd}>
      <div className="rounded-[12px] bg-card shadow-[var(--shadow-soft)]">
        <div className="flex border-b border-line pl-10">
          {days.map((d) => (
            <button key={d} type="button" onClick={() => onOpenDay(d)} className={cx('flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center text-[13px] font-semibold', d === today && 'text-primary-dark')}>
              <span>{weekdayName(isoWeekday(d), 'short')}</span>
              <span className="rounded px-1 text-base" style={holidayOn(d) ? { boxShadow: `inset 0 -3px 0 ${HOLIDAY[holidayOn(d)!.kind]}` } : undefined}>
                {Number(d.slice(8))}
              </span>
            </button>
          ))}
        </div>
        {days.some((d) => (cal.byDate.get(d) ?? []).some((x) => !x.plannedStart)) && (
          <div className="flex border-b border-line pl-10">
            {days.map((d) => (
              <div key={d} className="flex min-w-0 flex-1 flex-col gap-0.5 p-0.5">
                {(cal.byDate.get(d) ?? [])
                  .filter((x) => !x.plannedStart)
                  .map((x) => (
                    <button key={x.id} type="button" onClick={() => nav(itemHref(x.id))} className="truncate rounded px-1 text-left text-[13px] font-semibold" style={{ background: `var(--c${data.areas.find((a) => a.id === x.areaId)?.color ?? 6}-soft)` }}>
                      {x.title}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        )}
        <div ref={scroller} tabIndex={0} role="region" aria-label={t('cal.hours')} className="flex max-h-[65vh] overflow-y-auto">
          <HourLabels />
          {days.map((d) => (
            <DayColumn key={d} date={d} label={fmtLongDate(d)} onEmpty={(time) => open(undefined, { date: d, time })}>
              {(cal.byDate.get(d) ?? [])
                .filter((x) => x.plannedStart)
                .map((x) => (
                  <Block key={x.id} task={x} compact color={data.areas.find((a) => a.id === x.areaId)?.color ?? 6} onOpen={() => nav(itemHref(x.id))} />
                ))}
            </DayColumn>
          ))}
        </div>
      </div>
    </DndContext>
  );
}

// ---------------- Day ----------------
function DayView({ date, data, cal, now }: { date: DateKey; data: DayData; cal: NonNullable<ReturnType<typeof useCalendarData>>; now: string }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { open } = useCreate();
  const scroller = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<{ entry?: TimeEntry; start?: string; end?: string } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const items = cal.byDate.get(date) ?? [];
  const pct = date <= dateKey(now) ? dayPct(data, date, items) : null;
  const ds = dayStart(date).toISOString();
  const de = dayEnd(date).toISOString();
  const dayLen = minutesBetween(ds, de);
  const top = (iso: string) => Math.max(0, minutesBetween(ds, iso)) * PX_PER_MIN * (1440 / dayLen);
  const entries = data.entries.filter((e) => toDate(e.end ?? now) > toDate(ds) && toDate(e.start) < toDate(de));
  const day = data.days.find((d) => d.date === date);
  const activeFrom = day?.startedAt && day.startedAt > ds ? day.startedAt : ds;
  const activeTo = day ? (day.endedAt ?? (toDate(now) < toDate(de) ? now : de)) : null;
  const holes = day && activeTo ? gaps(entries, activeFrom, activeTo, now, 5) : [];
  const imp = cal.important.get(date) ?? [];
  useEffect(() => {
    const first = items.find((x) => x.plannedStart)?.plannedStart;
    scroller.current?.scrollTo({ top: (first ? hhmmToMinutes(first) - 60 : 7 * 60) * PX_PER_MIN });
  }, [date]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {date <= dateKey(now) && <Ring size={64} pct={pct} label={pct === null ? t('common.noData') : t('today.progressLabel', { p: pct })} />}
        <div>
          <h2 className="text-lg font-bold">{fmtLongDate(date)}</h2>
          <div className="flex flex-wrap gap-2">
            <HolidayTag date={date} />
            {holidayOn(date) && <span className="text-[13px]">{t(`holidays.${holidayOn(date)!.key}`)}</span>}
            {imp.map((x) => (
              <button key={x.id} type="button" onClick={() => nav(`/data/${x.id}`)} className="inline-flex min-h-8 items-center gap-1 text-[13px] font-semibold text-primary-dark">
                <Star size={12} aria-hidden />
                {x.name}
              </button>
            ))}
          </div>
        </div>
      </div>
      {items.filter((x) => !x.plannedStart).length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items
            .filter((x) => !x.plannedStart)
            .map((x) => (
              <li key={x.id}>
                <Button variant="secondary" onClick={() => nav(itemHref(x.id))}>
                  {x.title}
                </Button>
              </li>
            ))}
        </ul>
      )}
      <DndContext sensors={sensors}>
        <div className="rounded-[12px] bg-card shadow-[var(--shadow-soft)]">
          <div className="flex border-b border-line pl-10 text-[13px] font-bold">
            <span className="flex-1 py-2 text-center">{t('cal.plan')}</span>
            <span className="flex-1 py-2 text-center">{t('cal.real')}</span>
          </div>
          <div ref={scroller} tabIndex={0} role="region" aria-label={t('cal.hours')} className="flex max-h-[65vh] overflow-y-auto">
            <HourLabels />
            <DayColumn date={date} label={t('cal.plan')} onEmpty={(time) => open(undefined, { date, time })}>
              {items
                .filter((x) => x.plannedStart)
                .map((x) => (
                  <Block key={x.id} task={x} draggable={false} color={data.areas.find((a) => a.id === x.areaId)?.color ?? 6} onOpen={() => nav(itemHref(x.id))} />
                ))}
            </DayColumn>
            <div role="group" aria-label={t('cal.real')} className="relative min-w-0 flex-1 border-l border-line" style={{ height: 1440 * PX_PER_MIN }} data-testid="real-col">
              <GridLines />
              {entries.map((e) => {
                const s = toDate(e.start) < toDate(ds) ? ds : e.start;
                const en = e.end ? (toDate(e.end) > toDate(de) ? de : e.end) : now;
                const area = data.areas.find((a) => a.id === e.areaId);
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSheet({ entry: e })}
                    aria-label={`${e.activity}, ${fmtTime(s)}–${fmtTime(en)}, ${t(`class.${e.classification}`)}`}
                    data-testid="real-entry"
                    className="absolute right-0.5 left-0.5 overflow-hidden rounded-[6px] border-l-4 bg-card px-1 text-left text-[13px] leading-tight font-semibold text-ink"
                    style={{ top: top(s), height: Math.max(18, minutesBetween(s, en) * PX_PER_MIN), borderColor: CLASS_COLORS[e.classification], background: area ? `var(--c${area.color}-soft)` : '#F1F2F6' }}
                  >
                    {e.activity}
                    <span className="block font-normal">{t(`class.${e.classification}`)}</span>
                  </button>
                );
              })}
              {holes.map((g) => (
                <button
                  key={g.start}
                  type="button"
                  onClick={() => setSheet({ start: g.start, end: g.end })}
                  aria-label={`${t('time.noRecord')}, ${fmtTime(g.start)}–${fmtTime(g.end)}`}
                  data-testid="gap"
                  className="absolute right-0.5 left-0.5 rounded-[6px] border border-dashed border-[#9AA1B1] bg-[repeating-linear-gradient(45deg,#F7F7FA,#F7F7FA_6px,#FFFFFF_6px,#FFFFFF_12px)] px-1 text-left text-[13px] font-semibold text-muted"
                  style={{ top: top(g.start), height: Math.max(18, minutesBetween(g.start, g.end) * PX_PER_MIN) }}
                >
                  {t('time.noRecord')}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DndContext>
      <EntrySheet open={!!sheet} onClose={() => setSheet(null)} entry={sheet?.entry} start={sheet?.start} end={sheet?.end} />
    </div>
  );
}

// ---------------- Screen ----------------
export default function CalendarScreen() {
  const { t } = useTranslation();
  const now = useNow(60000);
  const today = dateKey(now);
  const [params, setParams] = useSearchParams();
  const view = (params.get('v') as View) || 'month';
  const anchor = params.get('d') || today;
  const set = (v: View, d: DateKey) => setParams({ v, d }, { replace: true });
  const data = useDayData();
  useCreateContext({ date: anchor });
  useEffect(() => {
    void syncAllTodoTasks();
  }, []);
  const year = Number(anchor.slice(0, 4));
  const range: [DateKey, DateKey] =
    view === 'year' ? [`${year}-01-01`, `${year}-12-31`] : view === 'month' ? [weekStart(monthStart(anchor)), addDays(weekStart(monthStart(anchor)), 41)] : view === 'week' ? [weekStart(anchor), addDays(weekStart(anchor), 6)] : [anchor, anchor];
  const cal = useCalendarData(data, range[0], range[1]);
  const step = (dir: 1 | -1) => {
    if (view === 'year') set(view, `${year + dir}-${anchor.slice(5)}`);
    if (view === 'month') set(view, addMonths(monthStart(anchor), dir));
    if (view === 'week') set(view, addDays(anchor, 7 * dir));
    if (view === 'day') set(view, addDays(anchor, dir));
  };
  const touch = useRef<{ x: number; y: number } | null>(null);
  const title =
    view === 'year'
      ? String(year)
      : view === 'month'
        ? `${fmtMonth(year, Number(anchor.slice(5, 7)))} ${year}`
        : view === 'week'
          ? `${fmtDate(weekStart(anchor))} – ${fmtDate(addDays(weekStart(anchor), 6))}`
          : fmtDate(anchor, { day: 'numeric', month: 'long', year: 'numeric' });
  if (!data || !cal) return null;
  const openDay = (d: DateKey) => set('day', d);
  return (
    <div
      className="mx-auto flex max-w-6xl flex-col gap-3"
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <PageTitle>{t('nav.calendar')}</PageTitle>
      <Segmented
        label={t('cal.view')}
        value={view}
        onChange={(v) => set(v, anchor)}
        options={[
          { value: 'year', label: t('cal.year') },
          { value: 'month', label: t('cal.month') },
          { value: 'week', label: t('cal.week') },
          { value: 'day', label: t('cal.day') },
        ]}
      />
      <div className="flex items-center justify-between gap-2">
        <IconButton label={t('cal.prev')} onClick={() => step(-1)}>
          <ChevronLeft />
        </IconButton>
        <p className="text-center text-lg font-bold" aria-live="polite" data-testid="cal-title">
          {title}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="soft" onClick={() => set(view, today)}>
            {t('common.today')}
          </Button>
          <IconButton label={t('cal.next')} onClick={() => step(1)}>
            <ChevronRight />
          </IconButton>
        </div>
      </div>
      {view === 'year' && <YearView year={year} data={data} cal={cal} today={today} onOpenDay={openDay} />}
      {view === 'month' && <MonthView anchor={anchor} data={data} cal={cal} today={today} onOpenDay={openDay} />}
      {view === 'month' && <MarksList from={monthStart(anchor)} to={addDays(addMonths(monthStart(anchor), 1), -1)} cal={cal} />}
      {view === 'week' && <WeekView anchor={anchor} data={data} cal={cal} today={today} onOpenDay={openDay} />}
      {view === 'week' && <MarksList from={weekStart(anchor)} to={addDays(weekStart(anchor), 6)} cal={cal} />}
      {view === 'day' && <DayView date={anchor} data={data} cal={cal} now={now} />}
    </div>
  );
}
