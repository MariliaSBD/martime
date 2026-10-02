import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft } from 'lucide-react';
import { db } from '@/db/db';
import { update, remove } from '@/db/repo';
import { minutesByClassification, thirtyMinuteTable, timeThieves } from '@/lib/domain/timeEntries';
import { AutoInput, Button, Card, ItemMenu, PageTitle, Toggle, useToast } from '@/components/ui';
import { fmtDateTime, fmtMinutes, fmtTime } from '@/lib/format';
import { useNow } from '@/state/data';
import { toDate } from '@/lib/time';
import type { Classification, LogSession, TimeEntry } from '@/db/types';

export const CLASS_COLORS: Record<Classification, string> = { essential: 'var(--c4)', useful: 'var(--c5)', waste: 'var(--c1)', travel: 'var(--c3)' };

export function sessionData(s: LogSession, entries: TimeEntry[], now: string) {
  const end = toDate(s.end).getTime() < toDate(now).getTime() ? s.end : now;
  const inside = entries.filter((e) => !e.deleted_at && toDate(e.end ?? now).getTime() > toDate(s.start).getTime() && toDate(e.start).getTime() < toDate(end).getTime());
  return {
    end,
    inside,
    table: thirtyMinuteTable(inside, s.start, s.end, now),
    dist: minutesByClassification(inside, now, s.start, end),
    thieves: timeThieves(
      inside.map((e) => ({ ...e, start: toDate(e.start) < toDate(s.start) ? s.start : e.start, end: e.end && toDate(e.end) > toDate(end) ? end : e.end })),
      now,
    ),
  };
}

export default function SessionDetail() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const now = useNow(30000);
  const s = useLiveQuery(() => db.sessions.get(id), [id]);
  const entries = useLiveQuery(() => db.timeEntries.toArray(), []) ?? [];
  if (!s || s.deleted_at) return null;
  const d = sessionData(s, entries, now);
  const total = Object.values(d.dist).reduce((a, b) => a + b, 0);
  const chosen = new Map(s.thieves.map((x) => [x.name.toLowerCase(), x]));
  const toggle = (name: string, on: boolean) => {
    const list = s.thieves.filter((x) => x.name.toLowerCase() !== name.toLowerCase());
    if (on && list.length >= 3) return;
    void update('sessions', s.id, { thieves: on ? [...list, { name, action: '' }] : list });
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
                const undo = await remove('sessions', s.id);
                toast(t('common.deleted'), undo);
                nav('/hoje');
              },
            },
          ]}
        />
      </div>
      <PageTitle>{t('session.title')}</PageTitle>
      <p className="text-base text-muted-bg">
        {fmtDateTime(s.start)} – {fmtDateTime(s.end)}
      </p>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">{t('session.distribution')}</h2>
        {total > 0 ? (
          <>
            <div className="flex h-4 overflow-hidden rounded-full" aria-hidden>
              {(Object.keys(d.dist) as Classification[]).map((k) => d.dist[k] > 0 && <span key={k} style={{ width: `${(d.dist[k] / total) * 100}%`, background: CLASS_COLORS[k] }} />)}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-[15px]">
              {(Object.keys(d.dist) as Classification[]).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: CLASS_COLORS[k] }} aria-hidden />
                  {t(`class.${k}`)}: {fmtMinutes(d.dist[k])} ({Math.round((d.dist[k] / total) * 100)}%)
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-muted">{t('common.notEnoughData')}</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('session.thieves')}</h2>
        {d.thieves.length ? (
          <ul className="flex flex-col gap-3">
            {d.thieves.map((th) => {
              const sel = chosen.get(th.name.toLowerCase());
              return (
                <li key={th.name} className="rounded-[8px] border border-line p-2">
                  <Toggle label={`${th.name} · ${fmtMinutes(th.minutes)}`} checked={!!sel} onChange={(v) => toggle(th.name, v)} />
                  {sel && (
                    <AutoInput
                      aria-label={t('session.action', { name: th.name })}
                      placeholder={t('session.actionPh')}
                      value={sel.action}
                      onSave={(v) => update('sessions', s.id, { thieves: s.thieves.map((x) => (x.name.toLowerCase() === th.name.toLowerCase() ? { ...x, action: v } : x)) })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-muted">{t('session.noWaste')}</p>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">{t('session.table')}</h2>
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-left text-[15px]">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-line">
                <th className="py-2 pr-2">{t('session.time')}</th>
                <th className="py-2 pr-2">{t('today.activity')}</th>
                <th className="py-2">{t('today.classification')}</th>
              </tr>
            </thead>
            <tbody>
              {d.table.map((row) => (
                <tr key={row.start} className="border-b border-line/60" data-testid="slot">
                  <td className="py-1.5 pr-2 tabular-nums">{fmtTime(row.start)}</td>
                  <td className="py-1.5 pr-2">{row.activity ?? <span className="text-muted">{t('time.noRecord')}</span>}</td>
                  <td className="py-1.5">{row.classification ? t(`class.${row.classification}`) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
