import { addDays, type DateKey } from '../time';

export interface Holiday {
  date: DateKey;
  key: string; // translation key under holidays.*
  kind: 'national' | 'lisbon';
}

/** Gregorian Easter (anonymous algorithm). */
export function easter(year: number): DateKey {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function holidays(year: number): Holiday[] {
  const e = easter(year);
  const fixed = (md: string, key: string): Holiday => ({ date: `${year}-${md}`, key, kind: 'national' });
  const list: Holiday[] = [
    fixed('01-01', 'newYear'),
    { date: addDays(e, -2), key: 'goodFriday', kind: 'national' },
    { date: e, key: 'easter', kind: 'national' },
    fixed('04-25', 'freedom'),
    fixed('05-01', 'labour'),
    { date: addDays(e, 60), key: 'corpusChristi', kind: 'national' },
    fixed('06-10', 'portugal'),
    fixed('08-15', 'assumption'),
    fixed('10-05', 'republic'),
    fixed('11-01', 'allSaints'),
    fixed('12-01', 'independence'),
    fixed('12-08', 'immaculate'),
    fixed('12-25', 'christmas'),
    { date: `${year}-06-13`, key: 'stAnthony', kind: 'lisbon' },
  ];
  return list.sort((x, y) => (x.date < y.date ? -1 : 1));
}

const cache = new Map<number, Map<DateKey, Holiday>>();
export function holidayOn(date: DateKey): Holiday | undefined {
  const y = Number(date.slice(0, 4));
  if (!cache.has(y)) cache.set(y, new Map(holidays(y).map((h) => [h.date, h])));
  return cache.get(y)!.get(date);
}
