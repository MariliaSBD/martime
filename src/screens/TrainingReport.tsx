import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, CircleCheck, CircleDashed, Download } from 'lucide-react';
import { db } from '@/db/db';
import { create, update } from '@/db/repo';
import type { TrainingSection } from '@/db/types';
import { AutoInput, Button, Card, Field, Input, PageTitle, Select, useToast, cx } from '@/components/ui';
import { BlocksView } from '@/components/BlocksView';
import { useSettings } from '@/state/app';
import { effectiveSources, emptySection, loadAll, sectionComplete, trainingContent, trainingReport, TRAINING_SECTIONS, WITH_FEEDBACK, type AllData, type TrainingKey } from '@/lib/pdf/reports';
import { makeReport, PdfReadySheet, type ReadyPdf } from './review/ReportsView';
import { addDays, weekStart } from '@/lib/time';
import { fmtDate } from '@/lib/format';

function Checks({ items, value, onChange, max, label }: { items: { id: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; max?: number; label: string }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="sr-only">{label}</legend>
      {items.map((i) => {
        const on = value.includes(i.id);
        return (
          <label key={i.id} className="flex min-h-11 items-center gap-3 rounded-[8px] px-2 hover:bg-primary-soft/30">
            <input type="checkbox" className="h-5 w-5 accent-[var(--primary)]" checked={on} disabled={!on && !!max && value.length >= max} onChange={(e) => onChange(e.target.checked ? [...value, i.id] : value.filter((x) => x !== i.id))} />
            <span className="text-[15px]">{i.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}

function SourcePicker({ k, d, sources, onChange }: { k: TrainingKey; d: AllData; sources: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const label = t('training.source');
  const sel = (options: { value: string; label: string }[], i = 0) => (
    <Select
      aria-label={label}
      value={sources[i] ?? ''}
      onChange={(e) => {
        const next = [...sources];
        next[i] = e.target.value;
        onChange(next.filter(Boolean));
      }}
      options={[{ value: '', label: t('training.choose') }, ...options]}
    />
  );
  switch (k) {
    case 't1':
      return <Input type="date" aria-label={t('training.weekOf')} value={sources[0] ?? ''} onChange={(e) => onChange(e.target.value ? [weekStart(e.target.value)] : [])} />;
    case 't3':
      return <Input type="date" aria-label={t('training.day')} value={sources[0] ?? ''} onChange={(e) => onChange(e.target.value ? [e.target.value] : [])} />;
    case 't2':
      return sel(d.projects.map((p) => ({ value: p.id, label: p.name })));
    case 't4':
      return sel(d.sessions.sort((a, b) => b.start.localeCompare(a.start)).map((s) => ({ value: s.id, label: `${fmtDate(s.start.slice(0, 10))} · ${Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / 3600000)} h` })));
    case 't5':
      return sel(d.reorganizations.sort((a, b) => b.created_at.localeCompare(a.created_at)).map((r) => ({ value: r.id, label: `${fmtDate(r.date)} · ${t(r.kind === 'simulation' ? 'reorg.simulation' : 'reorg.title')}` })));
    case 't6':
      return <Checks label={label} max={10} items={d.decisions.sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({ id: x.id, label: `${fmtDate(x.date)} · ${x.text}` }))} value={effectiveSources('t6', { ...emptySection(), sourceIds: sources }, d)} onChange={onChange} />;
    case 't7':
      return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {sel(d.goals.map((g) => ({ value: g.id, label: g.what })), 0)}
          {sel(d.goals.filter((g) => g.id !== sources[0]).map((g) => ({ value: g.id, label: g.what })), 1)}
        </div>
      );
    case 't8':
      return <Checks label={label} items={d.reflections.sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({ id: x.id, label: `${fmtDate(x.date)} · ${x.situation} (${t(x.context === 'real' ? 'reflections.real' : 'reflections.roleplay')})` }))} value={effectiveSources('t8', { ...emptySection(), sourceIds: sources }, d)} onChange={onChange} />;
    case 'close': {
      const weeks = [...new Set([...d.weeklyReviews.map((w) => w.weekStart)])].sort().reverse();
      return sel(weeks.map((w) => ({ value: d.weeklyReviews.find((x) => x.weekStart === w)!.id, label: `${fmtDate(w)} – ${fmtDate(addDays(w, 6))}` })));
    }
  }
}

export default function TrainingReport() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const toast = useToast();
  const settings = useSettings();
  const rec = useLiveQuery(() => db.trainingReports.get(settings.id), [settings.id]);
  const version = useLiveQuery(async () => {
    const xs = await Promise.all([db.projects.count(), db.sessions.count(), db.reorganizations.count(), db.decisions.count(), db.goals.count(), db.reflections.count(), db.weeklyReviews.count(), db.tasks.count()]);
    return xs.join('-') + (await db.tasks.orderBy('updated_at').last())?.updated_at;
  }, []);
  const [d, setD] = useState<AllData | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<ReadyPdf | null>(null);
  useEffect(() => {
    void loadAll(settings).then(setD);
  }, [version, rec?.updated_at, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const sections = rec && !rec.deleted_at ? rec.sections : {};
  const save = async (k: TrainingKey, patch: Partial<TrainingSection>) => {
    const next = { ...(sections[k] ?? emptySection()), ...patch };
    if (rec) await update('trainingReports', rec.id, { sections: { ...sections, [k]: next }, deleted_at: null });
    else await create('trainingReports', { id: settings.id, sections: { [k]: next } });
  };
  const done = TRAINING_SECTIONS.filter((k) => sectionComplete(k, sections[k] ?? emptySection(), d)).length;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Button variant="ghost" className="self-start" onClick={() => nav(-1)}>
        <ArrowLeft size={18} aria-hidden />
        {t('common.back')}
      </Button>
      <PageTitle
        actions={
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                setReady(await makeReport(trainingReport({ ...d, training: rec ?? null }), t('reports.types.training'), settings.name));
              } catch {
                toast(t('reports.failed'));
              }
              setBusy(false);
            }}
          >
            <Download size={18} aria-hidden />
            {t('reports.download')}
          </Button>
        }
      >
        {t('reports.titles.training')}
      </PageTitle>
      <PdfReadySheet pdf={ready} onClose={() => setReady(null)} />
      <p className="text-[15px] font-semibold">{t('training.progress', { n: done, total: TRAINING_SECTIONS.length })}</p>
      {TRAINING_SECTIONS.map((k) => {
        const sec = sections[k] ?? emptySection();
        const complete = sectionComplete(k, sec, d);
        return (
          <Card key={k} className="flex flex-col gap-3" data-testid={`training-${k}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold">{t(`training.sections.${k}`)}</h2>
              <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold', complete ? 'bg-success-soft text-success-dark' : 'bg-warning-soft text-warning-dark')} data-testid="status">
                {complete ? <CircleCheck size={14} aria-hidden /> : <CircleDashed size={14} aria-hidden />}
                {complete ? t('common.completed') : t('common.incomplete')}
              </span>
            </div>
            <Field label={t('training.source')}>{() => <SourcePicker k={k} d={d} sources={sec.sourceIds} onChange={(ids) => save(k, { sourceIds: ids })} />}</Field>
            <div className="rounded-[8px] border border-line p-3">
              <BlocksView blocks={trainingContent(k, effectiveSources(k, sec, d), d)} />
            </div>
            <Field label={t('training.justification')}>{(id) => <AutoInput id={id} multiline value={sec.justification} onSave={(v) => save(k, { justification: v })} />}</Field>
            {WITH_FEEDBACK.includes(k) && <Field label={t('reorg.feedback')}>{(id) => <AutoInput id={id} multiline value={sec.feedback} onSave={(v) => save(k, { feedback: v })} />}</Field>}
          </Card>
        );
      })}
    </div>
  );
}
