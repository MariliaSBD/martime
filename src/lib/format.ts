import i18n from '@/i18n';
import { atLocal, TZ, toDate, type DateKey } from './time';

const lang = () => (i18n.language === 'en' ? 'en-GB' : 'pt-PT');

/** "sexta-feira, 2 de outubro" */
export function fmtLongDate(key: DateKey): string {
  const s = new Intl.DateTimeFormat(lang(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ }).format(atLocal(key, '12:00'));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Short form "2 out." / "2 Oct" unless other options are given. */
export function fmtDate(key: DateKey, opts?: Intl.DateTimeFormatOptions): string {
  const d = atLocal(key, '12:00');
  if (!opts) {
    const day = Number(key.slice(8, 10));
    const month = new Intl.DateTimeFormat(lang(), { month: 'short', timeZone: TZ }).format(d);
    return `${day} ${month}`;
  }
  return new Intl.DateTimeFormat(lang(), { ...opts, timeZone: TZ }).format(d);
}

export function fmtTime(at: string | Date): string {
  return new Intl.DateTimeFormat(lang(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(toDate(at));
}

export function fmtDateTime(at: string): string {
  return new Intl.DateTimeFormat(lang(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ }).format(toDate(at));
}

export function fmtMonth(year: number, month: number, style: 'long' | 'short' = 'long'): string {
  const s = new Intl.DateTimeFormat(lang(), { month: style, timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 15)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function weekdayName(iso: number, style: 'long' | 'short' | 'narrow' = 'long'): string {
  // 2024-01-01 was a Monday
  const long = new Intl.DateTimeFormat(lang(), { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, iso)));
  if (style === 'short') return long.slice(0, 3); // "seg", "ter" / "Mon", "Tue"
  if (style === 'narrow') return long.slice(0, 1).toUpperCase();
  return long;
}

/** 75 → "1 h 15 min"; 45 → "45 min" */
export function fmtMinutes(min: number): string {
  const m = Math.round(min);
  if (Math.abs(m) < 60) return i18n.t('common.min', { n: m });
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? i18n.t('common.hm', { h, m: r }) : i18n.t('common.hours', { h });
}

/** Elapsed time as h:mm:ss */
export function fmtClock(min: number): string {
  const s = Math.max(0, Math.floor(min * 60));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function fmtNumber(n: number, digits = 1): string {
  return new Intl.NumberFormat(lang(), { maximumFractionDigits: digits }).format(n);
}

export function fmtHours(min: number): string {
  return `${fmtNumber(min / 60)} h`;
}
