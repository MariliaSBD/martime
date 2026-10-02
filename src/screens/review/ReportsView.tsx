import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Share } from 'lucide-react';
import { Button, Card, Field, IconButton, Input, RadioCards, Sheet, useToast } from '@/components/ui';
import { BlocksView } from '@/components/BlocksView';
import { useSettings } from '@/state/app';
import { loadAll, periodReport, reportLabels, type PeriodType } from '@/lib/pdf/reports';
import { downloadPdf, isIosDevice, loadAppFonts, renderPdf, sharePdf } from '@/lib/pdf/build';
import { pdfFileName, type ReportDoc } from '@/lib/pdf/blocks';
import { addDays, addMonths, dateKey, monthStart, nowIso } from '@/lib/time';
import { periodRange, periodTitle } from './StatsView';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface ReadyPdf {
  bytes: Uint8Array;
  name: string;
}

/** Generates the PDF. On the Mac it downloads straight away; on the iPhone it is returned so a tap can share it. */
export async function makeReport(doc: ReportDoc, typeLabel: string, name: string): Promise<ReadyPdf | null> {
  const bytes = await renderPdf(doc, reportLabels(), await loadAppFonts());
  const file = pdfFileName(typeLabel, name, dateKey(nowIso()));
  if (isIosDevice()) return { bytes, name: file };
  downloadPdf(bytes, file);
  return null;
}

export function PdfReadySheet({ pdf, onClose }: { pdf: ReadyPdf | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={!!pdf} onClose={onClose} title={t('reports.ready')}>
      <Button
        variant="primary"
        className="w-full"
        onClick={() => {
          sharePdf(pdf!.bytes, pdf!.name);
          onClose();
        }}
      >
        <Share size={18} aria-hidden />
        {t('reports.share')}
      </Button>
    </Sheet>
  );
}

export function ReportsView() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const [type, setType] = useState<PeriodType | 'training' | null>(null);
  const [anchor, setAnchor] = useState(dateKey(nowIso()));
  const [custom, setCustom] = useState<[string, string]>([addDays(dateKey(nowIso()), -13), dateKey(nowIso())]);
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<ReadyPdf | null>(null);
  const kind = type === 'period' ? 'custom' : type === 'training' || !type ? 'week' : type;
  const [from, to] = periodRange(kind, anchor, custom);

  useEffect(() => {
    if (type === 'training') nav('/formacao');
  }, [type, nav]);

  useEffect(() => {
    if (!type || type === 'training') return setDoc(null);
    let alive = true;
    void loadAll(settings).then((d) => alive && setDoc(periodReport(d, type, from, to, periodTitle(kind, from, to))));
    return () => {
      alive = false;
    };
  }, [type, from, to, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = (dir: 1 | -1) => {
    if (kind === 'week') setAnchor(addDays(anchor, 7 * dir));
    if (kind === 'month') setAnchor(addMonths(monthStart(anchor), dir));
    if (kind === 'year') setAnchor(`${Number(anchor.slice(0, 4)) + dir}-01-01`);
  };

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t('reports.create')}</h2>
        <RadioCards
          label={t('reports.type')}
          value={type}
          onChange={setType}
          columns={2}
          options={(['week', 'month', 'year', 'period', 'training'] as const).map((x) => ({ value: x, label: t(`reports.types.${x}`) }))}
        />
        {type && type !== 'training' && (
          <>
            {type === 'period' ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('stats.from')}>{(id) => <Input id={id} type="date" value={custom[0]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1] < e.target.value ? e.target.value : custom[1]])} />}</Field>
                <Field label={t('stats.to')}>{(id) => <Input id={id} type="date" value={custom[1]} onChange={(e) => e.target.value && setCustom([custom[0] > e.target.value ? e.target.value : custom[0], e.target.value])} />}</Field>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <IconButton label={t('cal.prev')} onClick={() => step(-1)}>
                  <ChevronLeft />
                </IconButton>
                <p className="font-bold" data-testid="report-period">
                  {periodTitle(kind, from, to)}
                </p>
                <IconButton label={t('cal.next')} onClick={() => step(1)}>
                  <ChevronRight />
                </IconButton>
              </div>
            )}
            <Button
              variant="primary"
              disabled={!doc || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setReady(await makeReport(doc!, t(`reports.types.${type}`), settings.name));
                } catch {
                  toast(t('reports.failed'));
                }
                setBusy(false);
              }}
            >
              <Download size={18} aria-hidden />
              {t('reports.download')}
            </Button>
          </>
        )}
      </Card>
      <PdfReadySheet pdf={ready} onClose={() => setReady(null)} />
      {doc && (
        <Card className="flex flex-col gap-4" data-testid="report-preview">
          <div className="flex items-center gap-2">
            <FileText size={20} aria-hidden className="text-primary-dark" />
            <h2 className="text-lg font-bold">{doc.title}</h2>
          </div>
          <p className="text-[15px] text-muted">{doc.period}</p>
          {doc.sections.map((s) => (
            <section key={s.title}>
              <h3 className="mb-1 text-lg font-bold text-primary-dark">{s.title}</h3>
              <BlocksView blocks={s.blocks} />
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
