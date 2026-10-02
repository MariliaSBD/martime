import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Moon, Repeat, Zap } from 'lucide-react';
import { db } from '@/db/db';
import { create, update } from '@/db/repo';
import type { Day } from '@/db/types';
import { Button, Card, useToast } from '@/components/ui';
import { useSettings } from '@/state/app';
import { saveSettings } from '@/state/settings';
import { blockError, canShowEnergySuggestion, suggestBlock } from '@/lib/domain/energy';
import { suggestRoutine } from '@/lib/domain/routines';
import { createTask } from '@/state/actions/tasks';
import { dateKey } from '@/lib/time';
import type { DayData } from './useToday';

/** Cards that only appear when they apply (7.2): rested reminders, energy block and routine suggestions. */
export function ContextCards({ data, now, active }: { data: DayData; now: string; active: Day | undefined }) {
  const { t } = useTranslation();
  const toast = useToast();
  const settings = useSettings();
  const rested = useLiveQuery(async () => (await db.notifications.toArray()).filter((n) => !n.deleted_at && n.status === 'deferred').sort((a, b) => a.send_at.localeCompare(b.send_at)), []) ?? [];

  const records = data.raw.filter((x) => !x.deleted_at && x.energyAtDone && x.completedAt).map((x) => ({ at: x.completedAt!, level: x.energyAtDone! }));
  const energy = canShowEnergySuggestion(settings.energySuggestionShownAt, now) ? suggestBlock(records, now) : null;
  const routine = suggestRoutine(data.raw, data.entries, now, settings.routineSuggestionsDismissed);

  return (
    <>
      {active && rested.length > 0 && (
        <Card className="border-l-4 border-primary" data-testid="rested">
          <h2 className="mb-2 flex items-center gap-2 text-base font-semibold">
            <Moon size={18} aria-hidden />
            {t('today.rested')}
          </h2>
          <ul className="mb-3 flex flex-col gap-1 text-[15px]">
            {rested.map((n) => (
              <li key={n.id}>
                <a href={n.url} className="underline-offset-2 hover:underline">
                  {n.body}
                </a>
              </li>
            ))}
          </ul>
          <Button
            onClick={async () => {
              for (const n of rested) await update('notifications', n.id, { status: 'sent' });
            }}
          >
            {t('today.seen')}
          </Button>
        </Card>
      )}
      {energy && (
        <Card className="border-l-4 border-success" data-testid="energy-suggestion">
          <p className="mb-3 flex items-start gap-2 text-base">
            <Zap size={18} aria-hidden className="mt-0.5 shrink-0 text-success-dark" />
            {t('suggest.energy', { start: energy.start, end: energy.end })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                const end = energy.end === '24:00' ? '23:59' : energy.end;
                if (blockError({ id: '', start: energy.start, end }, data.blocks)) toast(t('blocks.errOverlap'));
                else await create('energyBlocks', { name: t('suggest.energyName'), start: energy.start, end, level: 'high' });
                await saveSettings({ energySuggestionShownAt: now });
              }}
            >
              {t('common.create')}
            </Button>
            <Button onClick={() => saveSettings({ energySuggestionShownAt: now })}>{t('common.notNow')}</Button>
          </div>
        </Card>
      )}
      {routine && (
        <Card className="border-l-4 border-primary" data-testid="routine-suggestion">
          <p className="mb-3 flex items-start gap-2 text-base">
            <Repeat size={18} aria-hidden className="mt-0.5 shrink-0 text-primary-dark" />
            {t('suggest.routine', { name: routine.name })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                await createTask({ title: routine.name, areaId: routine.areaId ?? data.areas[0]?.id ?? '', date: dateKey(now), repeat: { freq: 'daily' } });
                await saveSettings({ routineSuggestionsDismissed: { ...settings.routineSuggestionsDismissed, [routine.key]: now } });
              }}
            >
              {t('common.create')}
            </Button>
            <Button onClick={() => saveSettings({ routineSuggestionsDismissed: { ...settings.routineSuggestionsDismissed, [routine.key]: now } })}>{t('common.notNow')}</Button>
          </div>
        </Card>
      )}
    </>
  );
}
