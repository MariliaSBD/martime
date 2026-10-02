import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, ListRestart, Moon, Sunrise } from 'lucide-react';
import { useNow } from '@/state/data';
import { useSettings } from '@/state/app';
import { useCreateContext, useCreate } from '@/components/CreateMenu';
import { Button, Card, EmptyState, Field, Input, Ring, useToast } from '@/components/ui';
import { fmtLongDate, fmtMinutes, fmtTime } from '@/lib/format';
import { atLocal, dateKey, localHHMM, minutesBetween, addDays } from '@/lib/time';
import { availableMinutes, dayTooLong, neededMinutes, needsOutcome } from '@/lib/domain/misc';
import { realMinutesOf } from '@/lib/domain/timeEntries';
import { expandItems } from '@/lib/domain/recurrence';
import { startDay } from '@/state/actions/day';
import { setEventStatus } from '@/state/actions/tasks';
import { saveSettings } from '@/state/settings';
import type { EventStatus, Task } from '@/db/types';
import { activeDayOf, dayItems, dayProgress, plannedAndReal, useDayData, type DayData } from './today/useToday';
import { NowCard } from './today/NowCard';
import { PlanList } from './today/PlanList';
import { ContextCards } from './today/ContextCards';

export const EVENT_STATUSES: EventStatus[] = ['ontime', 'late', 'postponed', 'cancelled_me', 'cancelled_other', 'missed'];

function EndTimeField({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label={label}>{(id) => <Input id={id} type="date" value={dateKey(value)} onChange={(e) => e.target.value && onChange(atLocal(e.target.value, localHHMM(value)).toISOString())} />}</Field>
      <Field label=" ">{(id) => <Input id={id} aria-label={label} type="time" value={localHHMM(value)} onChange={(e) => e.target.value && onChange(atLocal(dateKey(value), e.target.value).toISOString())} />}</Field>
    </div>
  );
}

function OutcomeCard({ ev }: { ev: Task }) {
  const { t } = useTranslation();
  return (
    <Card className="border-l-4 border-primary">
      <p className="mb-2 text-base font-semibold">{t('today.howDidItGo', { name: ev.title })}</p>
      <div className="flex flex-wrap gap-2">
        {EVENT_STATUSES.map((s) => (
          <Button key={s} variant="secondary" onClick={() => setEventStatus(ev.id, s)}>
            {t(`eventStatus.${s}`)}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function TooLongCard({ suggested, onEnd }: { suggested: string; onEnd: (at: string) => void }) {
  const { t } = useTranslation();
  const [at, setAt] = useState(suggested);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <Card className="border-l-4 border-warning" data-testid="too-long">
      <p className="mb-3 text-base font-semibold">{t('today.tooLong')}</p>
      <EndTimeField label={t('today.endedAt')} value={at} onChange={setAt} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => onEnd(at)}>
          {t('today.endAt', { t: fmtTime(at) })}
        </Button>
        <Button onClick={() => setHidden(true)}>{t('today.notYet')}</Button>
      </div>
    </Card>
  );
}

function suggestEnd(d: DayData, startedAt: string, now: string): string {
  const ends = [...d.entries.filter((e) => e.source !== 'sleep').map((e) => e.end), ...d.raw.filter((x) => !x.deleted_at).map((x) => x.completedAt)].filter((x): x is string => !!x && x >= startedAt && x <= now);
  return ends.length ? ends.reduce((m, x) => (x > m ? x : m)) : startedAt;
}

export default function Today() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const { open } = useCreate();
  const now = useNow(1000);
  const data = useDayData();
  const [askPrev, setAskPrev] = useState<string | null>(null);
  const [availableAsk, setAvailableAsk] = useState('');

  const active = data ? activeDayOf(data.days) : undefined;
  const date = active?.date ?? dateKey(now);
  useCreateContext({ date });

  const items = useMemo(() => (data ? dayItems(data, date) : []), [data, date]);
  if (!data) return null;

  const progress = dayProgress(data, date);
  const pr = plannedAndReal(items, data.entries, now);
  const afterMidnight = !!active && active.date !== dateKey(now);
  const ctx = { areas: data.areas, places: data.places, entries: data.entries, now };

  const outcomeEvents = expandItems(data.raw, addDays(dateKey(now), -7), dateKey(now)).filter((e) => needsOutcome(e, now));

  // Reorganizar (7.6)
  const availableUntilToday = settings.availableUntil && dateKey(settings.availableUntil) === date ? settings.availableUntil : null;
  let available = availableMinutes(now, date, settings, data.blocks);
  if (available === null && availableUntilToday) available = Math.max(0, Math.round(minutesBetween(now, availableUntilToday)));
  const needed = neededMinutes(items, (x) => realMinutesOf(x, data.entries, now));
  const showReorganize = available !== null && needed > available && !!active;

  const begin = async (prevEnd?: string) => {
    const r = await startDay(new Date().toISOString(), prevEnd);
    toast(t('today.dayStarted'), r.undo);
    setAskPrev(null);
  };
  const activeSession = data.sessions.find((s) => s.start <= now && s.end > now);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 lg:max-w-5xl">
      <Card className="flex items-center gap-4">
        <Ring pct={progress.pct} label={progress.pct === null ? t('today.noData') : t('today.progressLabel', { p: progress.pct })} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold">
            {fmtLongDate(date)}
            {afterMidnight && <span className="ml-2 text-base font-semibold text-muted">{fmtTime(now)}</span>}
          </h1>
          <p className="text-[15px] text-muted">{t('today.plannedReal', { p: fmtMinutes(pr.planned), r: fmtMinutes(pr.real) })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!active && (
              <Button variant="primary" onClick={() => begin()}>
                <Sunrise size={18} aria-hidden />
                {t('today.startDay')}
              </Button>
            )}
            {active && afterMidnight && (
              <Button onClick={() => setAskPrev(suggestEnd(data, active.startedAt, now))}>
                <Sunrise size={18} aria-hidden />
                {t('today.startDay')}
              </Button>
            )}
            {active && (
              <Button variant={afterMidnight ? 'primary' : 'secondary'} onClick={() => nav('/hoje/revisao')}>
                <Moon size={18} aria-hidden />
                {t('today.endDay')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {askPrev && (
        <Card className="border-l-4 border-primary">
          <p className="mb-3 text-base font-semibold">{t('today.prevEndQ')}</p>
          <EndTimeField label={t('today.endedAt')} value={askPrev} onChange={setAskPrev} />
          <div className="mt-3 flex gap-2">
            <Button onClick={() => setAskPrev(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => begin(askPrev)}>
              {t('today.startDay')}
            </Button>
          </div>
        </Card>
      )}

      {active && dayTooLong(active.startedAt, now) && <TooLongCard suggested={suggestEnd(data, active.startedAt, now)} onEnd={(at) => nav(`/hoje/revisao?fim=${encodeURIComponent(at)}`)} />}
      {outcomeEvents.map((ev) => (
        <OutcomeCard key={ev.id} ev={ev} />
      ))}
      <ContextCards data={data} now={now} active={active} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:items-start">
        <div className="flex flex-col gap-4">
          <NowCard data={data} dayTasks={items} now={now} />
          {activeSession && (
            <Card>
              <h2 className="mb-1 text-lg font-semibold">{t('session.title')}</h2>
              <p className="text-[15px]">{t('session.progress', { e: fmtMinutes(minutesBetween(activeSession.start, now)), r: fmtMinutes(minutesBetween(now, activeSession.end)), n: data.entries.filter((e) => e.start >= activeSession.start && e.start < activeSession.end).length })}</p>
              <Button variant="ghost" className="mt-1 px-0" onClick={() => nav(`/sessao/${activeSession.id}`)}>
                {t('session.open')}
              </Button>
            </Card>
          )}
          {active && available === null && !availableUntilToday && needed > 0 && (
            <Card>
              <Field label={t('today.availableUntilQ')}>
                {(id) => (
                  <div className="flex gap-2">
                    <Input id={id} type="time" value={availableAsk} onChange={(e) => setAvailableAsk(e.target.value)} />
                    <Button variant="soft" disabled={!availableAsk} onClick={() => saveSettings({ availableUntil: atLocal(date, availableAsk).toISOString() })}>
                      {t('common.save')}
                    </Button>
                  </div>
                )}
              </Field>
            </Card>
          )}
          {showReorganize && (
            <Card className="border-l-4 border-warning">
              <p className="mb-2 text-base font-semibold">{t('today.overbooked', { need: fmtMinutes(needed), avail: fmtMinutes(available!) })}</p>
              <Button variant="primary" onClick={() => nav('/hoje/reorganizar')}>
                <ListRestart size={18} aria-hidden />
                {t('reorg.title')}
              </Button>
            </Card>
          )}
        </div>

        <section aria-labelledby="plan-title">
          <h2 id="plan-title" className="mb-2 text-lg font-semibold">
            {t('today.plan')}
          </h2>
          {items.length ? (
            <PlanList items={items} blocks={data.blocks} ctx={ctx} />
          ) : (
            <EmptyState icon={<CalendarPlus size={32} />} text={t('today.empty')} action={t('today.addTask')} onAction={() => open('task', { date })} />
          )}
        </section>
      </div>
    </div>
  );
}
