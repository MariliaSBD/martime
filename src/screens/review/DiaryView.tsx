import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Gavel, Lightbulb, MessageSquareText } from 'lucide-react';
import { db } from '@/db/db';
import type { Decision } from '@/db/types';
import { useCreate } from '@/components/CreateMenu';
import { Card, EmptyState, Segmented, cx } from '@/components/ui';
import { TipView } from '@/components/TipView';
import { fmtDate, fmtLongDate } from '@/lib/format';

export function DecisionMap({ decisions, onOpen }: { decisions: Decision[]; onOpen?: (id: string) => void }) {
  const { t } = useTranslation();
  const quads: { impact: Decision['impact']; rev: Decision['reversibility'] }[] = [
    { impact: 'high', rev: 'easy' },
    { impact: 'high', rev: 'hard' },
    { impact: 'low', rev: 'easy' },
    { impact: 'low', rev: 'hard' },
  ];
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2" data-testid="decision-map">
      <span />
      <p className="text-center text-[13px] font-bold">{t('decisions.easy')}</p>
      <p className="text-center text-[13px] font-bold">{t('decisions.hard')}</p>
      {(['high', 'low'] as const).map((impact) => (
        <div key={impact} className="contents">
          <p className="self-center text-[13px] font-bold [writing-mode:vertical-rl] rotate-180">{t(impact === 'high' ? 'decisions.highImpact' : 'decisions.lowImpact')}</p>
          {quads
            .filter((q) => q.impact === impact)
            .map((q) => (
              <section key={q.rev} aria-label={`${t(impact === 'high' ? 'decisions.highImpact' : 'decisions.lowImpact')}, ${t(q.rev === 'easy' ? 'decisions.easy' : 'decisions.hard')}`} className={cx('min-h-28 rounded-[12px] border border-line p-2', impact === 'high' && q.rev === 'hard' ? 'bg-warning-soft/60' : 'bg-card')}>
                <ul className="flex flex-col gap-1">
                  {decisions
                    .filter((d) => d.impact === q.impact && d.reversibility === q.rev)
                    .map((d) => (
                      <li key={d.id}>
                        <button type="button" onClick={() => onOpen?.(d.id)} className="min-h-11 w-full rounded-[8px] px-2 text-left text-[15px] hover:bg-primary-soft/40">
                          {d.text}
                        </button>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
        </div>
      ))}
    </div>
  );
}

export function DiaryView() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { open } = useCreate();
  const [tab, setTab] = useState<'decisions' | 'reflections' | 'tips'>('decisions');
  const [map, setMap] = useState(false);
  const decisions = useLiveQuery(async () => (await db.decisions.toArray()).filter((x) => !x.deleted_at).sort((a, b) => b.date.localeCompare(a.date)), []) ?? [];
  const reflections = useLiveQuery(async () => (await db.reflections.toArray()).filter((x) => !x.deleted_at).sort((a, b) => b.date.localeCompare(a.date)), []) ?? [];
  const tips = useLiveQuery(async () => (await db.days.toArray()).filter((x) => !x.deleted_at && x.tip).sort((a, b) => b.date.localeCompare(a.date)), []) ?? [];
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label={t('review.diary')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'decisions', label: t('review.decisions') },
          { value: 'reflections', label: t('review.reflections') },
          { value: 'tips', label: t('review.tips') },
        ]}
      />
      {tab === 'decisions' &&
        (decisions.length ? (
          <>
            <Segmented
              label={t('review.decisions')}
              value={map ? 'map' : 'list'}
              onChange={(v) => setMap(v === 'map')}
              options={[
                { value: 'list', label: t('tasks.list') },
                { value: 'map', label: t('decisions.map') },
              ]}
            />
            {map ? (
              <DecisionMap decisions={decisions} onOpen={(id) => nav(`/decisao/${id}`)} />
            ) : (
              <ul className="flex flex-col gap-2">
                {decisions.map((d) => (
                  <li key={d.id}>
                    <button type="button" onClick={() => nav(`/decisao/${d.id}`)} className="w-full text-left">
                      <Card className="flex flex-col gap-1">
                        <span className="text-base font-semibold">{d.text}</span>
                        <span className="text-[13px] text-muted">
                          {fmtDate(d.date)} · {t(d.impact === 'high' ? 'decisions.highImpact' : 'decisions.lowImpact')} · {t(d.reversibility === 'easy' ? 'decisions.easy' : 'decisions.hard')} · {t(`decisions.approaches.${d.approach}`)}
                          {d.reviewOutcome && ` · ${t(`decisions.outcomes.${d.reviewOutcome}`)}`}
                        </span>
                      </Card>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <EmptyState icon={<Gavel size={32} />} text={t('decisions.empty')} action={t('create.decision')} onAction={() => open('decision')} />
        ))}
      {tab === 'reflections' &&
        (reflections.length ? (
          <ul className="flex flex-col gap-2">
            {reflections.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => nav(`/reflexao/${r.id}`)} className="w-full text-left">
                  <Card className="flex flex-col gap-1">
                    <span className="text-base font-semibold">{r.situation}</span>
                    <span className="text-[13px] text-muted">
                      {fmtDate(r.date)} · {t(`reflections.types.${r.type}`)} · {t(r.context === 'real' ? 'reflections.real' : 'reflections.roleplay')}
                      {r.attitude && ` · ${t(`reflections.attitudes.${r.attitude}`)}`}
                    </span>
                  </Card>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<MessageSquareText size={32} />} text={t('reflections.empty')} action={t('create.reflection')} onAction={() => open('reflection')} />
        ))}
      {tab === 'tips' &&
        (tips.length ? (
          <ul className="flex flex-col gap-2">
            {tips.map((d) => (
              <li key={d.id}>
                <Card>
                  <h3 className="mb-2 text-base font-semibold">{fmtLongDate(d.date)}</h3>
                  <TipView tip={d.tip} />
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Lightbulb size={32} />} text={t('review.noTips')} />
        ))}
    </div>
  );
}
