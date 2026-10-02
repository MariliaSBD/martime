import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share, SquarePlus } from 'lucide-react';
import { Button, Sheet } from './ui';

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** 13.4: the only written help in the app. */
export function InstallBanner() {
  const { t } = useTranslation();
  const [how, setHow] = useState(false);
  if (!isIos() || isStandalone()) return null;
  return (
    <div className="border-b border-line bg-primary-soft/60">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2">
        <p className="text-[15px] text-ink">{t('install.banner')}</p>
        <Button variant="soft" onClick={() => setHow(true)}>
          {t('install.how')}
        </Button>
      </div>
      <Sheet open={how} onClose={() => setHow(false)} title={t('install.how')}>
        <ol className="flex flex-col gap-3 text-base">
          <li className="flex items-center gap-3">
            <Share aria-hidden className="text-primary-dark" /> 1. {t('install.step1')}
          </li>
          <li className="flex items-center gap-3">
            <SquarePlus aria-hidden className="text-primary-dark" /> 2. {t('install.step2')}
          </li>
        </ol>
      </Sheet>
    </div>
  );
}
