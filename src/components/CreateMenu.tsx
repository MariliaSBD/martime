import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckSquare, Gavel, MessageSquareText, FolderKanban, Star, Target } from 'lucide-react';
import { Sheet } from './ui';

export type CreateKind = 'task' | 'event' | 'goal' | 'project' | 'decision' | 'reflection' | 'importantDate';

export interface Prefill {
  date?: string | null;
  time?: string | null;
  projectId?: string;
  goalId?: string;
  parentGoalId?: string;
  critical?: boolean;
  title?: string;
}

export interface CreateFormProps {
  prefill: Prefill;
  onDone: (id?: string) => void;
  onCancel: () => void;
}

const registry: Partial<Record<CreateKind, ComponentType<CreateFormProps>>> = {};
export function registerForm(kind: CreateKind, c: ComponentType<CreateFormProps>): void {
  registry[kind] = c;
}

interface CreateApi {
  open: (kind?: CreateKind, prefill?: Prefill) => void;
  /** Screens declare the date/time in context (Hoje, Calendário). */
  setContext: (p: Prefill | null) => void;
}

const Ctx = createContext<CreateApi>({ open: () => {}, setContext: () => {} });
export const useCreate = () => useContext(Ctx);

/** Declares the date/time in context while the calling screen is mounted. */
export function useCreateContext(p: Prefill | null): void {
  const { setContext } = useCreate();
  const key = JSON.stringify(p);
  useEffect(() => {
    setContext(p);
    return () => setContext(null);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

export const KINDS: { kind: CreateKind; icon: ComponentType<{ size?: number }> }[] = [
  { kind: 'task', icon: CheckSquare },
  { kind: 'event', icon: CalendarClock },
  { kind: 'goal', icon: Target },
  { kind: 'project', icon: FolderKanban },
  { kind: 'decision', icon: Gavel },
  { kind: 'reflection', icon: MessageSquareText },
  { kind: 'importantDate', icon: Star },
];

export function CreateProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<{ kind: CreateKind; prefill: Prefill } | null>(null);
  const ctx = useRef<Prefill | null>(null);

  const open = useCallback((kind?: CreateKind, prefill?: Prefill) => {
    const p = { ...(ctx.current ?? {}), ...(prefill ?? {}) };
    if (kind) {
      setMenu(false);
      setForm({ kind, prefill: p });
    } else {
      setForm(null);
      setMenu(true);
      pending.current = p;
    }
  }, []);
  const pending = useRef<Prefill>({});
  const setContext = useCallback((p: Prefill | null) => {
    ctx.current = p;
  }, []);
  const api = useMemo(() => ({ open, setContext }), [open, setContext]);

  const Form = form ? registry[form.kind] : undefined;
  const close = () => setForm(null);

  return (
    <Ctx.Provider value={api}>
      {children}
      <Sheet open={menu} onClose={() => setMenu(false)} title={t('create.title')}>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {KINDS.map(({ kind, icon: Icon }) => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => {
                  setMenu(false);
                  setForm({ kind, prefill: pending.current });
                }}
                className="flex min-h-14 w-full items-center gap-3 rounded-[12px] border border-line bg-card px-4 text-left text-base font-semibold hover:bg-primary-soft/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-primary-soft text-primary-dark" aria-hidden>
                  <Icon size={20} />
                </span>
                {t(`create.${kind}`)}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
      {form && Form && <Form prefill={form.prefill} onDone={close} onCancel={close} />}
    </Ctx.Provider>
  );
}
