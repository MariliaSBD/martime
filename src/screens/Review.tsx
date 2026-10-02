import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarCheck } from 'lucide-react';
import { db } from '@/db/db';
import { Card, EmptyState, PageTitle, Segmented } from '@/components/ui';
import { StatsView } from './review/StatsView';
import { DiaryView } from './review/DiaryView';
import { ReportsView } from './review/ReportsView';
import { addDays, dateKey, weekStart } from '@/lib/time';
import { fmtDate } from '@/lib/format';
import { useNow } from '@/state/data';
import { weekAvailable } from './WeekReview';

type Tab = 'stats' | 'diary' | 'weeks' | 'reports';

function WeeksView() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const now = useNow(60000);
  const reviews = useLiveQuery(async () => (await db.weeklyReviews.toArray()).filter((x) => !x.deleted_at), []) ?? [];
  const firstDay = useLiveQuery(async () => (await db.days.orderBy('date').first())?.date ?? null, []);
  const cur = weekStart(dateKey(now));
  const weeks: string[] = [];
  const start = firstDay ? weekStart(firstDay) : cur;
  for (let w = weekAvailable(cur, now) ? cur : addDays(cur, -7); w >= start; w = addDays(w, -7)) weeks.push(w);
  for (const r of reviews) if (!weeks.includes(r.weekStart)) weeks.push(r.weekStart);
  weeks.sort((a, b) => b.localeCompare(a));
  if (!weeks.length || (!firstDay && !reviews.length)) return <EmptyState icon={<CalendarCheck size={32} />} text={t('weeks.empty')} />;
  return (
    <ul className="flex flex-col gap-2">
      {weeks.map((w) => {
        const r = reviews.find((x) => x.weekStart === w);
        const answered = r ? [r.q1, r.q2, r.q3].filter((x) => x.trim()).length : 0;
        return (
          <li key={w}>
            <button type="button" onClick={() => nav(`/semana/${w}`)} className="w-full text-left">
              <Card className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold">{t('weeks.title', { from: fmtDate(w), to: fmtDate(addDays(w, 6)) })}</span>
                <span className="text-[13px] text-muted">{t('weeks.answered', { n: answered })}</span>
              </Card>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Review() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [tab, setTabState] = useState<Tab>((params.get('t') as Tab) || 'stats');
  const setTab = (v: Tab) => {
    setTabState(v);
    setParams({ t: v }, { replace: true });
  };
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <PageTitle>{t('nav.review')}</PageTitle>
      <Segmented
        label={t('nav.review')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'stats', label: t('review.stats') },
          { value: 'diary', label: t('review.diary') },
          { value: 'weeks', label: t('review.weeks') },
          { value: 'reports', label: t('review.reports') },
        ]}
      />
      {tab === 'stats' && <StatsView />}
      {tab === 'diary' && <DiaryView />}
      {tab === 'weeks' && <WeeksView />}
      {tab === 'reports' && <ReportsView />}
    </div>
  );
}
