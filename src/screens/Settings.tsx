import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, LogOut, Send, Upload } from 'lucide-react';
import { useApp, useSettings } from '@/state/app';
import { saveSettings, NOTIFICATION_TYPES } from '@/state/settings';
import { AreasEditor, BlocksEditor, EnableNotificationsButton, ScheduleEditor } from '@/components/editors';
import { PlacesEditor } from '@/components/PlacesEditor';
import { AutoInput, Button, Card, Field, Input, PageTitle, Sheet, Toggle, cx, useToast } from '@/components/ui';
import { PALETTES, type PaletteId } from '@/lib/colors';
import { download, exportAll, exportTimeCsv, importAll } from '@/state/actions/data';
import { useAreas } from '@/state/data';
import { sendTestNotification, permissionState } from '@/lib/push';
import { AuthError } from '@/auth/backend';
import { dateKey, nowIso } from '@/lib/time';
import i18n from '@/i18n';

function Section({ title, children, id }: { title: string; children: ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="mb-4">
      <h2 id={id} className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      <Card>{children}</Card>
    </section>
  );
}

function Account() {
  const { t } = useTranslation();
  const { session, auth, signOut } = useApp();
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [del, setDel] = useState(false);
  const [confirm, setConfirm] = useState('');
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-semibold">{t('auth.email')}</p>
        <p className="text-base">{session?.email}</p>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setPwErr(null);
          if (pw.length < 8) return setPwErr(t('auth.errors.weak'));
          try {
            await auth.changePassword(pw);
            setPw('');
            toast(t('settings.passwordChanged'));
          } catch (err) {
            setPwErr(t(`auth.errors.${err instanceof AuthError ? err.code : 'unknown'}`));
          }
        }}
      >
        <Field label={t('settings.changePassword')} error={pwErr}>
          {(id, d) => <Input id={id} type="password" autoComplete="new-password" aria-describedby={d} aria-invalid={!!pwErr} value={pw} onChange={(e) => setPw(e.target.value)} />}
        </Field>
        <Button type="submit" variant="soft" className="self-start">
          {t('settings.changePassword')}
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void signOut()}>
          <LogOut size={18} aria-hidden />
          {t('settings.signOut')}
        </Button>
        <Button variant="danger" onClick={() => setDel(true)}>
          {t('settings.deleteAccount')}
        </Button>
      </div>
      <Sheet
        open={del}
        onClose={() => setDel(false)}
        title={t('settings.deleteAccount')}
        footer={
          <>
            <Button onClick={() => setDel(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              disabled={confirm !== 'APAGAR'}
              onClick={async () => {
                try {
                  await auth.deleteAccount();
                  await signOut();
                } catch {
                  toast(t('auth.errors.unknown'));
                }
              }}
            >
              {t('settings.deleteForever')}
            </Button>
          </>
        }
      >
        <Field label={t('settings.typeDelete')}>{(id) => <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" placeholder="APAGAR" />}</Field>
      </Sheet>
    </div>
  );
}

function Notifications() {
  const { t } = useTranslation();
  const s = useSettings();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const perm = permissionState();
  const types = NOTIFICATION_TYPES.filter((x) => x !== 'goodMorning' || s.fixedSchedule);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base">
        <span className="font-semibold">{t('settings.permission')}: </span>
        {t(`notif.permission.${perm}`)}
      </p>
      {perm !== 'granted' && <EnableNotificationsButton />}
      <ul className="flex flex-col divide-y divide-line">
        {types.map((k) => (
          <li key={k}>
            <Toggle label={t(`notif.types.${k}`)} checked={s.notifications[k]} onChange={(v) => saveSettings({ notifications: { ...s.notifications, [k]: v } })} />
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label={t('settings.sessionInterval')}>
          {(id) => <AutoInput id={id} type="number" inputMode="numeric" min={5} value={String(s.sessionReminderMinutes)} onSave={(v) => saveSettings({ sessionReminderMinutes: Math.max(5, Number(v) || 30) })} />}
        </Field>
        {!s.sleepTarget && <Field label={t('settings.planTomorrowTime')}>{(id) => <Input id={id} type="time" value={s.planTomorrowTime} onChange={(e) => e.target.value && saveSettings({ planTomorrowTime: e.target.value })} />}</Field>}
      </div>
      <Button
        variant="soft"
        className="self-start"
        disabled={sending}
        onClick={async () => {
          setSending(true);
          const r = await sendTestNotification(i18n.language).catch(() => ({ ok: false, sent: 0 }));
          setSending(false);
          toast(r.ok && r.sent > 0 ? t('settings.testSent') : t('settings.testFailed'));
        }}
      >
        <Send size={18} aria-hidden />
        {t('settings.sendTest')}
      </Button>
    </div>
  );
}

function DataSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const areas = useAreas() ?? [];
  const file = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<string | null>(null);
  const stamp = dateKey(nowIso());
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={async () => download(`MarTime-dados-${stamp}.json`, await exportAll(), 'application/json')}>
        <Download size={18} aria-hidden />
        {t('settings.exportJson')}
      </Button>
      <Button onClick={async () => download(`MarTime-registos-${stamp}.csv`, await exportTimeCsv((id) => areas.find((a) => a.id === id)?.name ?? ''), 'text/csv')}>
        <Download size={18} aria-hidden />
        {t('settings.exportCsv')}
      </Button>
      <Button onClick={() => file.current?.click()}>
        <Upload size={18} aria-hidden />
        {t('settings.importJson')}
      </Button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label={t('settings.importJson')}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) setPending(await f.text());
          e.target.value = '';
        }}
      />
      <Sheet
        open={!!pending}
        onClose={() => setPending(null)}
        title={t('settings.importJson')}
        footer={
          <>
            <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                try {
                  await importAll(pending!);
                  toast(t('settings.imported'));
                } catch {
                  toast(t('settings.importFailed'));
                }
                setPending(null);
              }}
            >
              {t('settings.replaceAll')}
            </Button>
          </>
        }
      >
        <p className="text-base">{t('settings.importWarning')}</p>
      </Sheet>
    </div>
  );
}

export default function SettingsScreen() {
  const { t, i18n: inst } = useTranslation();
  const s = useSettings();
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle>{t('nav.settings')}</PageTitle>
      <Section id="s-account" title={t('settings.account')}>
        <Account />
      </Section>
      <Section id="s-profile" title={t('settings.profile')}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label={t('settings.name')}>{(id) => <AutoInput id={id} value={s.name} placeholder={t('settings.namePh')} onSave={(v) => saveSettings({ name: v })} />}</Field>
          <Field label={t('settings.course')}>{(id) => <AutoInput id={id} value={s.course} placeholder={t('settings.coursePh')} onSave={(v) => saveSettings({ course: v })} />}</Field>
          <Field label={t('settings.module')}>{(id) => <AutoInput id={id} value={s.module} placeholder={t('settings.modulePh')} onSave={(v) => saveSettings({ module: v })} />}</Field>
        </div>
      </Section>
      <Section id="s-lang" title={t('settings.language')}>
        <div role="radiogroup" aria-label={t('settings.language')} className="flex gap-2">
          {(['pt-PT', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={inst.language === l}
              onClick={() => {
                void inst.changeLanguage(l);
                void saveSettings({ language: l });
              }}
              className={cx('min-h-11 flex-1 rounded-[8px] border px-3 font-semibold', inst.language === l ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line')}
            >
              {l === 'pt-PT' ? 'Português (Portugal)' : 'English'}
            </button>
          ))}
        </div>
      </Section>
      <Section id="s-palette" title={t('settings.palette')}>
        <div role="radiogroup" aria-label={t('settings.palette')} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(PALETTES) as PaletteId[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={s.palette === id}
              onClick={() => saveSettings({ palette: id })}
              className={cx('flex min-h-11 flex-col gap-2 rounded-[12px] border p-3 text-left', s.palette === id ? 'border-primary ring-2 ring-primary' : 'border-line')}
              style={{ background: PALETTES[id].bg }}
            >
              <span className="font-semibold">{t(`palettes.${id}`)}</span>
              <span className="flex gap-1" aria-hidden>
                <span className="h-6 w-6 rounded-full" style={{ background: PALETTES[id].primary }} />
                {PALETTES[id].colors.map((c) => (
                  <span key={c} className="h-6 w-6 rounded-full" style={{ background: c }} />
                ))}
              </span>
            </button>
          ))}
        </div>
      </Section>
      <Section id="s-areas" title={t('settings.areas')}>
        <AreasEditor />
      </Section>
      <Section id="s-blocks" title={t('onboarding.blocks')}>
        <BlocksEditor />
      </Section>
      <Section id="s-schedule" title={t('settings.schedule')}>
        <ScheduleEditor />
      </Section>
      <Section id="s-places" title={t('settings.places')}>
        <PlacesEditor />
      </Section>
      <Section id="s-notif" title={t('onboarding.notifications')}>
        <Notifications />
      </Section>
      <Section id="s-data" title={t('settings.data')}>
        <DataSection />
      </Section>
    </div>
  );
}
