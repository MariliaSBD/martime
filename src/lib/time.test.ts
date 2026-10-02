import { describe, expect, it } from 'vitest';
import { addDays, addMonths, atLocal, dateKey, dayEnd, dayStart, isoWeekday, localHHMM, minutesBetween, weekStart } from './time';

describe('time in Europe/Lisbon', () => {
  it('uses Lisbon for the day key, not UTC', () => {
    // 23:30 UTC on 1 Oct 2026 is 00:30 on 2 Oct in Lisbon (summer time, UTC+1)
    expect(dateKey('2026-10-01T23:30:00Z')).toBe('2026-10-02');
    expect(dateKey('2026-12-01T23:30:00Z')).toBe('2026-12-01');
  });

  it('autumn change on 25 October 2026 makes a 25 hour day', () => {
    expect(dayStart('2026-10-25').toISOString()).toBe('2026-10-24T23:00:00.000Z');
    expect(dayEnd('2026-10-25').toISOString()).toBe('2026-10-26T00:00:00.000Z');
    expect(minutesBetween(dayStart('2026-10-25'), dayEnd('2026-10-25'))).toBe(25 * 60);
    expect(localHHMM('2026-10-25T00:30:00Z')).toBe('01:30');
    expect(localHHMM('2026-10-25T01:30:00Z')).toBe('01:30');
    expect(atLocal('2026-10-25', '09:00').toISOString()).toBe('2026-10-25T09:00:00.000Z');
  });

  it('spring change on 28 March 2027 makes a 23 hour day', () => {
    expect(minutesBetween(dayStart('2027-03-28'), dayEnd('2027-03-28'))).toBe(23 * 60);
    expect(atLocal('2027-03-28', '00:30').toISOString()).toBe('2027-03-28T00:30:00.000Z');
    expect(atLocal('2027-03-28', '09:00').toISOString()).toBe('2027-03-28T08:00:00.000Z');
    // 01:30 does not exist; it moves forward
    expect(localHHMM(atLocal('2027-03-28', '01:30'))).toBe('02:30');
  });

  it('weeks run Monday to Sunday', () => {
    expect(isoWeekday('2026-10-02')).toBe(5);
    expect(weekStart('2026-10-04')).toBe('2026-09-28');
    expect(weekStart('2026-10-05')).toBe('2026-10-05');
  });

  it('adds days and months', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
  });
});
