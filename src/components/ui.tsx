import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, X } from 'lucide-react';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

// ---------- Buttons ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:brightness-110',
  secondary: 'bg-card text-ink border border-line hover:bg-primary-soft/40',
  ghost: 'text-primary-dark hover:bg-primary-soft/50',
  danger: 'bg-danger-soft text-danger-dark hover:brightness-95',
  soft: 'bg-primary-soft text-primary-dark hover:brightness-95',
};

export function Button({ variant = 'secondary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[8px] px-4 text-base font-semibold transition disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function IconButton({ label, className, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...p} className={cx('inline-flex h-11 min-w-11 items-center justify-center rounded-[8px] text-ink hover:bg-primary-soft/50', className)}>
      {children}
    </button>
  );
}

// ---------- Layout ----------
export function Card({ className, children, ...p }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...p} className={cx('rounded-[12px] bg-card p-4 shadow-[var(--shadow-soft)]', className)}>
      {children}
    </div>
  );
}

export function PageTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-bold">{children}</h1>
      {actions}
    </div>
  );
}

export function SectionTitle({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-2">
      <h2 className="text-lg font-semibold">{children}</h2>
      {actions}
    </div>
  );
}

export function EmptyState({ icon, text, action, onAction }: { icon: ReactNode; text: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-line bg-card/60 px-4 py-8 text-center">
      <div className="text-primary-dark" aria-hidden>
        {icon}
      </div>
      <p className="text-base text-muted">{text}</p>
      {action && onAction && (
        <Button variant="soft" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

// ---------- Form fields ----------
export function Field({ label, error, children, hint, id }: { label: string; error?: string | null; children: (id: string, describedBy?: string) => ReactNode; hint?: string; id?: string }) {
  const auto = useId();
  const fid = id ?? auto;
  const errId = `${fid}-err`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fid} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {children(fid, error ? errId : undefined)}
      {hint && !error && <span className="text-[13px] text-muted">{hint}</span>}
      {error && (
        <span id={errId} role="alert" className="text-[13px] font-medium text-danger-dark">
          {error}
        </span>
      )}
    </div>
  );
}

const inputCls = 'min-h-11 w-full rounded-[8px] border border-line bg-card px-3 text-base text-ink placeholder:text-muted aria-[invalid=true]:border-danger';

export function Input(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx(inputCls, p.className)} />;
}

export function TextArea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...p} className={cx(inputCls, 'py-2', p.className)} />;
}

export function Select({ options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select {...p} className={cx(inputCls, 'pr-8', p.className)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Text input that saves on change after a short pause (detail screens have no Save button). */
export function AutoInput({ value, onSave, multiline, ...p }: { value: string; onSave: (v: string) => void; multiline?: boolean } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(value);
  useEffect(() => {
    if (value !== latest.current) {
      latest.current = value;
      setV(value);
    }
  }, [value]);
  const change = (nv: string) => {
    setV(nv);
    latest.current = nv;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSave(nv), 400);
  };
  const flush = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      onSave(v);
    }
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  if (multiline)
    return <textarea rows={3} id={p.id} aria-describedby={p['aria-describedby']} placeholder={p.placeholder} aria-label={p['aria-label']} value={v} onChange={(e) => change(e.target.value)} onBlur={flush} className={cx(inputCls, 'py-2')} />;
  return <input {...p} value={v} onChange={(e) => change(e.target.value)} onBlur={flush} className={cx(inputCls, p.className)} />;
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cx('flex flex-wrap gap-1 rounded-[8px] bg-primary-soft/50 p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-11 flex-1 rounded-[8px] px-3 text-[15px] font-semibold whitespace-nowrap', value === o.value ? 'bg-card text-primary-dark shadow-[var(--shadow-soft)]' : 'text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span className="text-base">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cx('relative h-7 w-12 shrink-0 rounded-full transition', checked ? 'bg-primary' : 'bg-[#9AA1B1]')}
      >
        <span className={cx('absolute top-1 h-5 w-5 rounded-full bg-white transition-all', checked ? 'left-6' : 'left-1')} />
      </button>
    </label>
  );
}

// ---------- Dialog / sheet ----------
export function Sheet({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const first = el?.querySelector<HTMLElement>('input,select,textarea,button:not([data-close])');
    (first ?? el)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault();
          f[f.length - 1].focus();
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault();
          f[0].focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1F2333]/40 lg:items-center" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('flex max-h-[92dvh] w-full flex-col rounded-t-[16px] bg-bg shadow-xl lg:rounded-[12px]', wide ? 'lg:max-w-3xl' : 'lg:max-w-lg')}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <IconButton data-close label={t('common.close')} onClick={onClose}>
            <X size={22} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="pb-safe flex gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- ⋯ menu ----------
export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  icon?: ReactNode;
}

export function ItemMenu({ items, label }: { items: MenuItem[]; label?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', key);
    ref.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus();
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label ?? t('common.moreOptions')}
        title={label ?? t('common.moreOptions')}
        onClick={() => setOpen(!open)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-[8px] text-muted hover:bg-primary-soft/50"
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 min-w-48 rounded-[8px] border border-line bg-card py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cx('flex min-h-11 w-full items-center gap-2 px-3 text-left text-base hover:bg-primary-soft/40 focus:bg-primary-soft/40', it.danger && 'text-danger-dark')}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Swipe to delete (touch) ----------
export function SwipeRow({ children, onDelete }: { children: ReactNode; onDelete: () => void }) {
  const { t } = useTranslation();
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);
  const horizontal = useRef(false);
  return (
    <div className="relative overflow-hidden rounded-[12px]">
      {dx < 0 && (
        <button type="button" onClick={onDelete} className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger-soft font-semibold text-danger-dark">
          {t('common.delete')}
        </button>
      )}
      <div
        style={{ transform: `translateX(${dx}px)` }}
        className="relative transition-transform"
        onTouchStart={(e) => {
          start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          horizontal.current = false;
        }}
        onTouchMove={(e) => {
          if (!start.current) return;
          const ddx = e.touches[0].clientX - start.current.x;
          const ddy = e.touches[0].clientY - start.current.y;
          if (!horizontal.current && Math.abs(ddx) > 12 && Math.abs(ddx) > Math.abs(ddy)) horizontal.current = true;
          if (horizontal.current) setDx(Math.max(-96, Math.min(0, ddx + (dx < 0 ? -96 : 0))));
        }}
        onTouchEnd={() => {
          start.current = null;
          if (horizontal.current) setDx(dx < -48 ? -96 : 0);
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ---------- Toasts with undo ----------
interface ToastItem {
  id: number;
  text: string;
  undo?: () => void | Promise<void>;
}
const ToastCtx = createContext<(text: string, undo?: () => void | Promise<void>) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);
  const push = useCallback((text: string, undo?: () => void | Promise<void>) => {
    const id = ++counter.current;
    setItems((xs) => [...xs.slice(-2), { id, text, undo }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 8000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((x) => (
          <div key={x.id} role="status" className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-[12px] bg-ink px-4 py-2 text-white shadow-lg">
            <span className="text-base">{x.text}</span>
            {x.undo && (
              <button
                type="button"
                className="min-h-11 rounded-[8px] px-3 font-semibold text-[#C5CEFF] underline-offset-2 hover:underline"
                onClick={async () => {
                  setItems((xs) => xs.filter((y) => y.id !== x.id));
                  await x.undo!();
                }}
              >
                {t('common.undo')}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Progress ring ----------
export function Ring({ pct, size = 88, label }: { pct: number | null; size?: number; label: string }) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const v = pct ?? 0;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E7E9F2" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={8} strokeLinecap="round" strokeDasharray={`${(c * Math.min(100, v)) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="absolute text-lg font-bold" aria-hidden>
        {pct === null ? '—' : `${pct}%`}
      </span>
    </div>
  );
}

export function Bar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
      <span className="w-11 text-right text-[13px] font-semibold text-ink" aria-hidden>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

export function Tag({ children, color }: { children: ReactNode; color?: number }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[13px] font-semibold"
      style={color ? { background: `var(--c${color}-soft)`, color: `var(--c${color}-dark)` } : { background: '#EEF0F6', color: '#1F2333' }}
    >
      {children}
    </span>
  );
}

export function RadioCards<T extends string>({ value, onChange, options, label, columns = 3 }: { value: T | null; onChange: (v: T) => void; options: { value: T; label: string; desc?: string }[]; label: string; columns?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('min-h-11 rounded-[8px] border px-2 py-2 text-left text-[15px] font-semibold', value === o.value ? 'border-primary bg-primary-soft text-primary-dark' : 'border-line bg-card text-ink')}
        >
          {o.label}
          {o.desc && <span className="mt-0.5 block text-[13px] font-normal text-muted">{o.desc}</span>}
        </button>
      ))}
    </div>
  );
}
