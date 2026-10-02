import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { localAuth, supabaseAuth, type AuthBackend, type Session } from '@/auth/backend';
import { supabase, supabaseRemote } from '@/lib/supabase';
import { db, resetDb } from '@/db/db';
import { setRepoUser } from '@/db/repo';
import { SyncEngine, type SyncState } from '@/db/sync';
import { setSyncEngine } from '@/db/syncHandle';
import { defaultSettings, ensureSettings } from './settings';
import type { Settings } from '@/db/types';
import i18n, { rememberLang } from '@/i18n';
import { applyPalette } from '@/lib/colors';
import { startScheduler } from './actions/notifications';

interface AppState {
  auth: AuthBackend;
  session: Session | null;
  ready: boolean;
  sync: SyncState;
  syncNow: () => void;
  settings: Settings;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export const authBackend: AuthBackend = supabase ? supabaseAuth(supabase) : localAuth();

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider missing');
  return v;
}

export function useSettings(): Settings {
  return useApp().settings;
}

async function prepareUser(userId: string): Promise<void> {
  const owner = (await db.meta.get('owner'))?.value;
  if (owner && owner !== userId) await resetDb();
  await db.meta.put({ key: 'owner', value: userId });
  setRepoUser(userId);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [sync, setSync] = useState<SyncState>(supabase ? 'synced' : 'local');
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const currentUser = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const apply = async (s: Session | null) => {
      if (currentUser.current === (s?.userId ?? null)) return;
      currentUser.current = s?.userId ?? null;
      if (s) {
        await prepareUser(s.userId);
        const eng = new SyncEngine(supabase ? supabaseRemote(supabase) : null, s.userId);
        if (supabase && navigator.onLine) await eng.now().catch(() => undefined);
        await ensureSettings(s.userId);
        if (!alive) return;
        setEngine((old) => {
          old?.stop();
          return eng;
        });
      } else {
        setRepoUser(null);
        setEngine((old) => {
          old?.stop();
          return null;
        });
      }
      if (alive) {
        setSession(s);
        setReady(true);
      }
    };
    void authBackend.getSession().then(apply);
    const off = authBackend.onChange((s) => void apply(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    if (!engine) return;
    const off = engine.subscribe(setSync);
    engine.start();
    setSyncEngine(engine);
    return () => {
      off();
      engine.stop();
      setSyncEngine(null);
    };
  }, [engine]);

  const stored = useLiveQuery(() => (session ? db.settings.get(session.userId) : undefined), [session?.userId]);
  const settings = useMemo<Settings>(() => {
    const d = defaultSettings(session?.userId ?? 'local');
    return stored ? { ...d, ...stored, notifications: { ...d.notifications, ...stored.notifications } } : d;
  }, [stored, session?.userId]);

  useEffect(() => {
    if (!stored) return;
    if (i18n.language !== stored.language) void i18n.changeLanguage(stored.language);
    rememberLang(stored.language);
  }, [stored?.language]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyPalette(settings.palette);
  }, [settings.palette]);

  useEffect(() => {
    if (!session) return;
    return startScheduler();
  }, [session?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = useCallback(() => void engine?.now(), [engine]);

  const signOut = useCallback(async () => {
    await engine?.now().catch(() => undefined);
    await authBackend.signOut();
    // with a server the data come back on the next sign-in; without one they must stay on the device
    if (supabase) await resetDb();
    currentUser.current = null;
    setSession(null);
    setRepoUser(null);
  }, [engine]);

  const value = useMemo(() => ({ auth: authBackend, session, ready, sync, syncNow, settings, signOut }), [session, ready, sync, syncNow, settings, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
