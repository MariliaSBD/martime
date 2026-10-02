import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pause, Square, Timer } from 'lucide-react';
import type { Classification, Task, TimeEntry } from '@/db/types';
import { taskTimer, entryMinutes } from '@/lib/domain/timeEntries';
import { fmtClock, fmtMinutes } from '@/lib/format';
import { pauseTask } from '@/state/actions/tasks';
import { recentActivities, startFree, startSession, stopFree } from '@/state/actions/time';
import { useFlows } from '@/components/flows';
import { AreaSelect } from '@/components/fields';
import { Button, Card, Field, Input, RadioCards, Sheet, Segmented, cx, useToast } from '@/components/ui';
import { useSettings } from '@/state/app';
import type { DayData } from './useToday';
import { nowIso, atLocal, dateKey, localHHMM } from '@/lib/time';

export const CLASSES: Classification[] = ['essential', 'useful', 'waste'];

export function FreeLogSheet({ open, onClose, data, dayTasks }: { open: boolean; onClose: () => void; data: DayData; dayTasks: Task[] }) {
  const { t } = useTranslation();
  const flows = useFlows();
  const toast = useToast();
  const settings = useSettings();
  const [recent, setRecent] = useState<{ activity: string; areaId: string | null; classification: Classification }[]>([]);
  const [text, setText] = useState('');
  const [area, setArea] = useState('');
  const [cls, setCls] = useState<Classification>('useful');
  const [tried, setTried] = useState(false);
  useEffect(() => {
    if (open) void recentActivities().then(setRecent);
    if (open) {
      setText('');
      setTried(false);
      setArea(settings.lastAreaId ?? data.areas[0]?.id ?? '');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (activity: string, areaId: string | null, c: Classification) => {
    const r = await startFree(activity, areaId, c);
    onClose();
    if (r.stopped) toast(t('today.endedName', { name: r.stopped }), r.undo);
  };
  const pending = dayTasks.filter((x) => x.kind === 'task' && x.status === 'pending');
  return (
    <Sheet open={open} onClose={onClose} title={t('today.whatDoing')}>
      <div className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (text.trim()) void go(text, area || null, cls);
          }}
        >
          <Field label={t('today.activity')} error={tried && !text.trim() ? t('common.required') : null}>
            {(id, d) => <Input id={id} aria-describedby={d} placeholder={t('today.activityPh')} value={text} onChange={(e) => setText(e.target.value)} />}
          </Field>
          <Field label={t('common.area')}>{(id) => <AreaSelect id={id} value={area} onChange={setArea} />}</Field>
          <RadioCards label={t('today.classification')} value={cls} onChange={setCls} options={CLASSES.map((c) => ({ value: c, label: t(`class.${c}`) }))} />
          <Button type="submit" variant="primary">
            {t('today.startActivity')}
          </Button>
        </form>
        {recent.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('today.recent')}</h3>
            <ul className="flex flex-wrap gap-2">
              {recent.map((r) => (
                <li key={r.activity}>
                  <Button variant="secondary" onClick={() => go(r.activity, r.areaId, r.classification)}>
                    {r.activity}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pending.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('today.dayTasks')}</h3>
            <ul className="flex flex-col gap-1">
              {pending.map((x) => (
                <li key={x.id}>
                  <Button
                    variant="secondary"
                    className="w-full justify-start"
                    onClick={async () => {
                      await flows.start(x);
                      onClose();
                    }}
                  >
                    {x.title}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

export function StartSessionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useSettings();
  const [dur, setDur] = useState<'24' | '48' | 'custom'>('48');
  const [custom, setCustom] = useState('12');
  const [when, setWhen] = useState<'now' | 'at'>('now');
  const [date, setDate] = useState(dateKey(nowIso()));
  const [time, setTime] = useState(localHHMM(nowIso()));
  const [interval, setInterval] = useState(String(s.sessionReminderMinutes));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('session.new')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={async () => {
              const hours = dur === 'custom' ? Math.max(1, Number(custom) || 1) : Number(dur);
              const start = when === 'now' ? nowIso() : atLocal(date, time).toISOString();
              await startSession(start, hours, Math.max(5, Number(interval) || 30));
              onClose();
            }}
          >
            {t('common.create')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label={t('session.duration')}>
          {() => (
            <Segmented
              label={t('session.duration')}
              value={dur}
              onChange={setDur}
              options={[
                { value: '24', label: '24 h' },
                { value: '48', label: '48 h' },
                { value: 'custom', label: t('fields.custom') },
              ]}
            />
          )}
        </Field>
        {dur === 'custom' && <Field label={t('session.hours')}>{(id) => <Input id={id} type="number" min={1} value={custom} onChange={(e) => setCustom(e.target.value)} />}</Field>}
        <Field label={t('session.start')}>
          {() => (
            <Segmented
              label={t('session.start')}
              value={when}
              onChange={setWhen}
              options={[
                { value: 'now', label: t('session.now') },
                { value: 'at', label: t('session.at') },
              ]}
            />
          )}
        </Field>
        {when === 'at' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('common.date')}>{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label={t('common.start')}>{(id) => <Input id={id} type="time" value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          </div>
        )}
        <Field label={t('settings.sessionInterval')}>{(id) => <Input id={id} type="number" min={5} value={interval} onChange={(e) => setInterval(e.target.value)} />}</Field>
      </div>
    </Sheet>
  );
}

/** 7.3 Agora: the activity in progress, computed from stored instants. */
export function NowCard({ data, dayTasks, now }: { data: DayData; dayTasks: Task[]; now: string }) {
  const { t } = useTranslation();
  const flows = useFlows();
  const [logOpen, setLogOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const running: TimeEntry | undefined = data.entries.find((e) => !e.end && (e.source === 'timer' || e.source === 'free'));
  const task = running?.taskId ? (data.raw.find((x) => x.id === running.taskId) ?? null) : null;
  const area = data.areas.find((a) => a.id === (task?.areaId ?? running?.areaId));
  const activeSession = data.sessions.some((s) => s.start <= now && s.end > now);

  let body;
  if (!running) {
    body = (
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="primary" className="flex-1" onClick={() => setLogOpen(true)}>
          <Timer size={18} aria-hidden />
          {t('today.whatDoing')}
        </Button>
        {!activeSession && (
          <Button variant="secondary" onClick={() => setSessionOpen(true)}>
            {t('session.new')}
          </Button>
        )}
      </div>
    );
  } else {
    const real = task ? taskTimer(task, data.entries, now).realMinutes : entryMinutes(running, now);
    const planned = task ? task.plannedMinutes || 30 : null;
    const over = planned !== null && real > planned;
    body = (
      <div className={cx('flex flex-col gap-3 rounded-[12px] p-3', over ? 'bg-warning-soft' : 'bg-primary-soft/50')} data-testid="now-card" data-over={over ? 'true' : 'false'}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-bold break-words">{running.activity}</p>
            {area && (
              <p className="text-[13px] font-semibold" style={{ color: `var(--c${area.color}-dark)` }}>
                {area.name}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className={cx('font-mono text-2xl font-bold tabular-nums', over ? 'text-warning-dark' : 'text-ink')} aria-label={t('today.elapsed', { t: fmtMinutes(real) })}>
              {fmtClock(real)}
            </p>
            {planned !== null && (
              <p className={cx('text-[13px] font-semibold', over ? 'text-warning-dark' : 'text-ink')}>
                {over ? `+${Math.floor(real - planned)} min` : t('today.plannedShort', { t: fmtMinutes(planned) })}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {task ? (
            <>
              <Button onClick={() => pauseTask(task.id)}>
                <Pause size={18} aria-hidden />
                {t('today.pause')}
              </Button>
              <Button variant="primary" onClick={() => flows.complete(task)}>
                <Check size={18} aria-hidden />
                {t('today.complete')}
              </Button>
            </>
          ) : (
            <Button onClick={() => stopFree(running.id)}>
              <Square size={16} aria-hidden />
              {t('today.stop')}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setLogOpen(true)}>
            {t('today.whatDoing')}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <section aria-labelledby="now-title">
      <Card>
        <h2 id="now-title" className="mb-2 text-lg font-semibold">
          {t('today.now')}
        </h2>
        {body}
      </Card>
      <FreeLogSheet open={logOpen} onClose={() => setLogOpen(false)} data={data} dayTasks={dayTasks} />
      <StartSessionSheet open={sessionOpen} onClose={() => setSessionOpen(false)} />
    </section>
  );
}
