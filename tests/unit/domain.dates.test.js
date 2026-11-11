import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();

describe('parseDate (constitution VI: d/m/yyyy C.E. display values)', () => {
  it('parses d/m/yyyy', () => {
    expect(D.parseDate('16/4/2026')).toEqual({ raw: '16/4/2026', date: d(2026, 4, 16), issue: null });
  });

  it('parses zero-padded values and trims spaces', () => {
    expect(D.parseDate(' 05/01/2026 ').date).toEqual(d(2026, 1, 5));
  });

  it('returns no date and no issue for empty values', () => {
    expect(D.parseDate('')).toEqual({ raw: '', date: null, issue: null });
    expect(D.parseDate(null)).toEqual({ raw: '', date: null, issue: null });
  });

  it('flags unparseable text and keeps the original text', () => {
    expect(D.parseDate('ปลายเดือน')).toEqual({ raw: 'ปลายเดือน', date: null, issue: 'DATE_UNPARSEABLE' });
  });

  it('flags impossible calendar dates as unparseable', () => {
    expect(D.parseDate('31/2/2026').issue).toBe('DATE_UNPARSEABLE');
    expect(D.parseDate('0/1/2026').issue).toBe('DATE_UNPARSEABLE');
    expect(D.parseDate('1/13/2026').issue).toBe('DATE_UNPARSEABLE');
  });

  it('converts Buddhist-era years for calculation and flags them', () => {
    expect(D.parseDate('16/4/2569')).toEqual({
      raw: '16/4/2569',
      date: d(2026, 4, 16),
      issue: 'DATE_BUDDHIST_YEAR',
    });
  });

  it('accepts leap days', () => {
    expect(D.parseDate('29/2/2028').date).toEqual(d(2028, 2, 29));
  });
});

describe('formatDate / formatThai', () => {
  it('formats back to the sheet format d/m/yyyy without padding', () => {
    expect(D.formatDate(d(2026, 4, 6))).toBe('6/4/2026');
  });

  it('returns empty string for null', () => {
    expect(D.formatDate(null)).toBe('');
    expect(D.formatThai(null)).toBe('');
  });

  it('shows Thai short dates with Buddhist year', () => {
    expect(D.formatThai(d(2026, 4, 16))).toBe('16 เม.ย. 69');
  });

  it('converts ISO input (from <input type=date>) to a sheet date', () => {
    expect(D.fromIso('2026-04-16')).toEqual(d(2026, 4, 16));
    expect(D.toIso(d(2026, 4, 6))).toBe('2026-04-06');
    expect(D.fromIso('')).toBeNull();
  });
});

describe('day math', () => {
  it('daysBetween counts calendar days (b - a)', () => {
    expect(D.daysBetween(d(2026, 4, 16), d(2026, 4, 20))).toBe(4);
    expect(D.daysBetween(d(2026, 12, 31), d(2027, 1, 1))).toBe(1);
  });

  it('compareDate orders dates', () => {
    expect(D.compareDate(d(2026, 1, 1), d(2026, 1, 2))).toBeLessThan(0);
    expect(D.compareDate(d(2026, 1, 2), d(2026, 1, 2))).toBe(0);
  });

  it('addDays crosses month and year boundaries', () => {
    expect(D.addDays(d(2026, 12, 30), 3)).toEqual(d(2027, 1, 2));
  });

  it('weekRange is Monday–Sunday containing the date', () => {
    // 11 Nov 2026 is a Wednesday
    expect(D.weekRange(d(2026, 11, 11))).toEqual({ from: d(2026, 11, 9), to: d(2026, 11, 15) });
    // Sunday belongs to the week that started the previous Monday
    expect(D.weekRange(d(2026, 11, 15))).toEqual({ from: d(2026, 11, 9), to: d(2026, 11, 15) });
  });

  it('monthRange is the calendar month', () => {
    expect(D.monthRange(d(2028, 2, 10))).toEqual({ from: d(2028, 2, 1), to: d(2028, 2, 29) });
  });

  it('inRange is inclusive', () => {
    const r = { from: d(2026, 1, 1), to: d(2026, 1, 31) };
    expect(D.inRange(d(2026, 1, 1), r)).toBe(true);
    expect(D.inRange(d(2026, 1, 31), r)).toBe(true);
    expect(D.inRange(d(2026, 2, 1), r)).toBe(false);
    expect(D.inRange(null, r)).toBe(false);
  });
});

describe('formatThaiLong (hero greeting)', () => {
  it('shows weekday, full month and Buddhist year', () => {
    expect(D.formatThaiLong(d(2026, 11, 11))).toBe('วันพุธที่ 11 พฤศจิกายน 2569');
    expect(D.formatThaiLong(d(2027, 1, 3))).toBe('วันอาทิตย์ที่ 3 มกราคม 2570');
    expect(D.formatThaiLong(null)).toBe('');
  });
});
