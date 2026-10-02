import { describe, expect, it } from 'vitest';
import { easter, holidayOn, holidays } from './holidays';

describe('holidays (9, C5)', () => {
  it('Easter reference values', () => {
    expect(easter(2026)).toBe('2026-04-05');
    expect(easter(2027)).toBe('2027-03-28');
  });

  it('2026 movable holidays', () => {
    expect(holidayOn('2026-04-03')?.key).toBe('goodFriday');
    expect(holidayOn('2026-06-04')?.key).toBe('corpusChristi');
  });

  it('2027 movable holidays', () => {
    expect(holidayOn('2027-03-26')?.key).toBe('goodFriday');
    expect(holidayOn('2027-05-27')?.key).toBe('corpusChristi');
  });

  it('has 13 national and 1 Lisbon holiday each year', () => {
    for (const y of [2026, 2027, 2030]) {
      const h = holidays(y);
      expect(h.filter((x) => x.kind === 'national')).toHaveLength(13);
      expect(h.filter((x) => x.kind === 'lisbon')).toEqual([{ date: `${y}-06-13`, key: 'stAnthony', kind: 'lisbon' }]);
    }
  });

  it('fixed dates', () => {
    for (const d of ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-08', '12-25']) expect(holidayOn(`2027-${d}`)?.kind).toBe('national');
    expect(holidayOn('2026-10-02')).toBeUndefined();
  });
});
