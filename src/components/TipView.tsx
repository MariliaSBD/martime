import { useTranslation } from 'react-i18next';
import type { Tip } from '@/db/types';
import { fmtMinutes } from '@/lib/format';

function values(v: Record<string, string | number>, t: (k: string) => string): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k.endsWith('Min')) out[k.replace(/Min$/, '')] = fmtMinutes(Number(x));
    else if (k === 'status') out[k] = t(`tip.status.${x}`);
    else out[k] = x;
  }
  return out;
}

/** Renders a stored tip in the current language (15). */
export function useTipLines(tip: Tip | null): { intro: string | null; good: string; watch: string | null; tomorrow: string } | null {
  const { t } = useTranslation();
  if (!tip) return null;
  const tt = (k: string) => t(k);
  let watch: string | null = null;
  if (tip.watch) {
    watch = t(`tip.${tip.watch.rule}`, values(tip.watch.values, tt));
    if (tip.watch.rule === 'O2' && tip.watch.values.n) watch += ' ' + t('tip.O2more', values(tip.watch.values, tt));
  }
  return {
    intro: tip.intro ? t('tip.intro') : null,
    good: t(`tip.${tip.good.rule}`, values(tip.good.values, tt)),
    watch,
    tomorrow: t(`tip.${tip.tomorrow.rule}`, values(tip.tomorrow.values, tt)),
  };
}

export function TipView({ tip }: { tip: Tip | null }) {
  const { t } = useTranslation();
  const l = useTipLines(tip);
  if (!l) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="tip">
      {l.intro && <p className="text-base font-semibold">{l.intro}</p>}
      <div>
        <p className="text-[13px] font-bold text-success-dark uppercase">{t('tip.good')}</p>
        <p className="text-base">{l.good}</p>
      </div>
      {l.watch && (
        <div>
          <p className="text-[13px] font-bold text-warning-dark uppercase">{t('tip.watch')}</p>
          <p className="text-base">{l.watch}</p>
        </div>
      )}
      <div>
        <p className="text-[13px] font-bold text-primary-dark uppercase">{t('tip.tomorrow')}</p>
        <p className="text-base">{l.tomorrow}</p>
      </div>
    </div>
  );
}
