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
    expect(D.urgencyRank('')).toBe(2); // empty counts as ปกติ (user, 2026-11-25)
    expect(D.urgencyRank('อื่น')).toBe(3);
  });
  it('an empty urgency reads and filters as ปกติ; a typed value is kept as it is', () => {
    expect(D.urgencyOf('')).toBe('ปกติ');
    expect(D.urgencyOf(' ')).toBe('ปกติ');
    expect(D.urgencyOf('ด่วน')).toBe('ด่วน');
    expect(D.urgencyOf('อื่น')).toBe('อื่น');
    const rows = ['', 'ปกติ', 'ด่วน'].map((urgency, i) =>
      D.enrich({ rowNumber: i + 2, seq: String(i + 1), detail: 'x', urgency }, { y: 2026, m: 11, d: 25 }),
    );
    expect(D.applyFilters(rows, { urgency: ['ปกติ'] }).map((r) => r.seq)).toEqual([1, 2]);
    expect(D.applyFilters(rows, { urgency: ['ด่วน'] }).map((r) => r.seq)).toEqual([3]);
    expect(rows[0].raw.urgency || '').toBe(''); // shown only: the sheet cell stays empty
  });
});
