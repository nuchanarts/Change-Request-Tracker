import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// Regression tests for code-review findings (2026-11-11).
const D = loadDomain();
const today = d(2026, 11, 11);
const rows = ['1', '7', '17', '70'].map((seq, i) =>
  D.enrich({ rowNumber: i + 2, seq, detail: 'งาน ' + seq, status: 'กำลังพัฒนา', ticket: '' }, today),
);

describe('drill-down with an empty id list', () => {
  it('returns no rows (an empty drill-down is not "no filter")', () => {
    expect(D.applyFilters(rows, { ids: [] })).toEqual([]);
  });
});

describe('search for single-digit item numbers', () => {
  it('finds item 7 when typing "7"', () => {
    expect(D.search(rows, '7').map((r) => r.id)).toEqual(['7']);
  });
  it('still ignores a single non-digit character', () => {
    expect(D.search(rows, 'ง').length).toBe(rows.length);
  });
});

describe('validateUpdate rejects inherited object keys', () => {
  it('treats "constructor" / "toString" as unknown fields', () => {
    const res = D.validateUpdate({ constructor: { from: '', to: 'x' } }, {}, { status: D.WORKFLOW });
    expect(res.ok).toBe(false);
    expect(res.errors.constructor).toMatch(/ไม่รู้จัก/);
    expect(D.isColumnKey('toString')).toBe(false);
    expect(D.isColumnKey('status')).toBe(true);
  });
});

describe('shared helpers used by Repo and the UI', () => {
  it('exports clean/toInt with the same rules Domain uses', () => {
    expect(D.clean('  a ')).toBe('a');
    expect(D.toInt('12')).toBe(12);
    expect(D.toInt('12.0')).toBe(12);
    expect(D.toInt('12a')).toBeNull();
  });
  it('ranks urgency from one list', () => {
    expect(D.URGENCY).toEqual(['ด่วนที่สุด', 'ด่วน', 'ปกติ']);
    expect(D.urgencyRank('ด่วนที่สุด')).toBe(0);
    expect(D.urgencyRank('ปกติ')).toBe(2);
    expect(D.urgencyRank('')).toBe(3);
  });
});
