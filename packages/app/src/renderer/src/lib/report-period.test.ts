import { describe, expect, it } from 'vitest';
import { defaultReportPeriod, displayEndDate, localDayEndExclusive, localDayStart } from './report-period';

describe('report period helpers', () => {
  it('defaults to the last seven natural days including today', () => {
    expect(defaultReportPeriod(new Date(2026, 9, 22, 15, 30))).toEqual({
      start: '2026-10-16',
      end: '2026-10-22',
    });
  });

  it('uses local calendar boundaries and an inclusive display end date', () => {
    const start = localDayStart('2026-10-16');
    const end = localDayEndExclusive('2026-10-22');
    expect(new Date(start).getHours()).toBe(0);
    expect(new Date(end).getDate()).toBe(23);
    expect(displayEndDate(end)).toBe('2026-10-22');
  });

  it('rejects invalid calendar dates', () => {
    expect(() => localDayStart('2026-02-30')).toThrow();
    expect(() => localDayEndExclusive('not-a-date')).toThrow();
  });
});
