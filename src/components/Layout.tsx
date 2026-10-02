import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BarChart3, CalendarDays, Check, CloudOff, ListChecks, Loader2, Plus, RefreshCw, Settings as Gear, Sun, Target, TriangleAlert, Smartphone } from 'lucide-react';
import { useApp } from '@/state/app';
import { saveSettings } from '@/state/settings';
import { useCreate } from './CreateMenu';
import { cx } from './ui';
import { InstallBanner } from './InstallBanner';
import { ForegroundNotifications } from './ForegroundNotifications';

const TABS = [
  { to: '/hoje', key: 'nav.today', icon: Sun },
  { to: '/calendario', key: 'nav.calendar', icon: CalendarDays },
  { to: '/tarefas', key: 'nav.tasks', icon: ListChecks },
  { to: '/objetivos', key: 'nav.goals', icon: Target },
  { to: '/revisao', key: 'nav.review', icon: BarChart3 },
] as const;

export function SyncIndicator() {
  const { t } = useTranslation();
  const { sync, syncNow } = useApp();
  const map = {
    synced: { icon: <Check size={18} />, label: t('sync.synced'), cls: 'text-success-dark' },
    syncing: { icon: <Loader2 size={18} className="motion-safe:animate-spin" />, label: t('sync.syncing'), cls: 'text-primary-dark' },
    offline: { icon: <CloudOff size={18} />, label: t('sync.offline'), cls: 'text-warning-dark' },
    error: { icon: <TriangleAlert size={18} />, label: t('sync.error'), cls: 'text-danger-dark' },
    local: { icon: <Smartphone size={18} />, label: t('sync.local'), cls: 'text-muted' },
  }[sync];
  return (
    <div className="flex items-center gap-1">
      <span role="status" aria-label={map.label} title={map.label} className={cx('inline-flex h-11 items-center gap-1 px-1', map.cls)}>
        {map.icon}
        <span className="sr-only">{map.label}</span>
      </span>
      {sync === 'error' && (
        <button type="button" onClick={syncNow} className="inline-flex min-h-11 items-center gap-1 rounded-[8px] px-2 text-[13px] font-semibold text-danger-dark hover:bg-danger-soft">
          <RefreshCw size={16} aria-hidden />
          {t('sync.retry')}
        </button>
      )}
    </div>
  );
}

export function LangSwitch() {
  const { i18n, t } = useTranslation();
  const { session } = useApp();
  const set = (l: 'pt-PT' | 'en') => {
    void i18n.changeLanguage(l);
    try {
      localStorage.setItem('martime.lang', l);
    } catch {
      // ignore
    }
    if (session) void saveSettings({ language: l });
  };
  return (
    <div role="group" aria-label={t('settings.language')} className="flex items-center rounded-[8px] border border-line bg-card text-[13px] font-bold">
      {(['pt-PT', 'en'] as const).map((l) => (
        <button key={l} type="button" aria-pressed={i18n.language === l} onClick={() => set(l)} className={cx('h-11 min-w-11 rounded-[8px] px-2', i18n.language === l ? 'bg-primary-soft text-primary-dark' : 'text-muted')}>
          {l === 'pt-PT' ? 'PT' : 'EN'}
        </button>
      ))}
    </div>
  );
}

export function Layout() {
  const { t } = useTranslation();
  const { open } = useCreate();
  const loc = useLocation();
  const showFab = TABS.some((tab) => loc.pathname.startsWith(tab.to));

  return (
    <div className="min-h-dvh lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-[8px] focus:bg-card focus:p-2">
        {t('nav.skip')}
      </a>
      {/* Sidebar (Mac) */}
      <nav aria-label={t('nav.main')} className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:border-r lg:border-line lg:bg-card lg:px-3 lg:py-4">
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={32} height={32} className="rounded-[8px]" />
          <span className="text-xl font-bold">MarTime</span>
        </div>
        <ul className="flex flex-1 flex-col gap-1">
          {TABS.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-base font-semibold', isActive ? 'bg-primary-soft text-primary-dark' : 'text-ink hover:bg-primary-soft/40')}>
                <Icon size={20} aria-hidden />
                {t(key)}
              </NavLink>
            </li>
          ))}
        </ul>
        <NavLink to="/definicoes" className={({ isActive }) => cx('flex min-h-11 items-center gap-3 rounded-[8px] px-3 text-base font-semibold', isActive ? 'bg-primary-soft text-primary-dark' : 'text-ink hover:bg-primary-soft/40')}>
          <Gear size={20} aria-hidden />
          {t('nav.settings')}
        </NavLink>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4">
            <div className="flex items-center gap-2 lg:hidden">
              <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" width={28} height={28} className="rounded-[6px]" />
              <span className="text-lg font-bold">MarTime</span>
            </div>
            <div className="hidden lg:block" />
            <div className="flex items-center gap-1">
              <SyncIndicator />
              <LangSwitch />
              <NavLink to="/definicoes" aria-label={t('nav.settings')} title={t('nav.settings')} className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] hover:bg-primary-soft/50 lg:hidden">
                <Gear size={22} aria-hidden />
              </NavLink>
            </div>
          </div>
        </header>
        <InstallBanner />
        <ForegroundNotifications />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-32 lg:px-8 lg:pb-12">
          <Outlet />
        </main>
      </div>

      {showFab && (
        <button
          type="button"
          onClick={() => open()}
          aria-label={t('create.title')}
          title={t('create.title')}
          className="fixed right-4 bottom-[calc(76px+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg lg:right-8 lg:bottom-8"
        >
          <Plus size={28} aria-hidden />
        </button>
      )}

      {/* Bottom tab bar (iPhone) */}
      <nav aria-label={t('nav.main')} className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card lg:hidden">
        <ul className="grid grid-cols-5">
          {TABS.map(({ to, key, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} className={({ isActive }) => cx('flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[13px] font-semibold', isActive ? 'text-primary-dark' : 'text-muted')}>
                {({ isActive }) => (
                  <>
                    <span className={cx('flex h-7 w-12 items-center justify-center rounded-full', isActive && 'bg-primary-soft')}>
                      <Icon size={20} aria-hidden />
                    </span>
                    {t(key)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
