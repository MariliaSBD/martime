import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AreasEditor, BlocksEditor, EnableNotificationsButton, ScheduleEditor } from '@/components/editors';
import { Button, Card } from '@/components/ui';
import { LangSwitch } from '@/components/Layout';
import { createDefaultAreas } from '@/state/actions/areas';
import { saveSettings } from '@/state/settings';

const STEPS = ['areas', 'blocks', 'schedule', 'notifications'] as const;

/** 13: four steps after creating the account. */
export default function Onboarding() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);

  useEffect(() => {
    void createDefaultAreas([0, 1, 2, 3, 4, 5, 6].map((i) => t(`areas.defaults.${i}`)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const finish = async () => {
    await saveSettings({ onboarded: true });
    location.hash = '#/hoje';
  };
  const next = () => (step === STEPS.length - 1 ? void finish() : setStep(step + 1));
  const key = STEPS[step];
  const skippable = key !== 'areas';

  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={32} height={32} />
          <span className="text-lg font-bold">MarTime</span>
        </div>
        <LangSwitch />
      </div>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step + 1} aria-label={t('onboarding.progress', { n: step + 1, total: 4 })} className="flex gap-2">
        {STEPS.map((s, i) => (
          <span key={s} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-line'}`} />
        ))}
      </div>
      <p className="text-[15px] font-semibold text-muted-bg">{t('onboarding.progress', { n: step + 1, total: 4 })}</p>
      <h1 className="text-2xl font-bold">{t(`onboarding.${key}`)}</h1>
      <Card>
        {key === 'areas' && <AreasEditor />}
        {key === 'blocks' && <BlocksEditor />}
        {key === 'schedule' && <ScheduleEditor />}
        {key === 'notifications' && <EnableNotificationsButton onResult={() => undefined} />}
      </Card>
      <div className="flex justify-between gap-2">
        {step > 0 ? <Button onClick={() => setStep(step - 1)}>{t('common.back')}</Button> : <span />}
        <div className="flex gap-2">
          {skippable && <Button onClick={next}>{key === 'notifications' ? t('common.notNow') : t('common.skip')}</Button>}
          <Button variant="primary" onClick={next}>
            {step === STEPS.length - 1 ? t('onboarding.finish') : t('common.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
