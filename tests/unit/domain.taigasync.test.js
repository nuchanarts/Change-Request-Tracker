// Taiga status shown next to the sheet status (user request 2026-11-24).
// แมวส้ม logs the Taiga events; the app only reads them.
import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();
const URL = 'https://taiga.hosxp.net/project/ehp/us/77';
const KEY = 'taiga.hosxp.net/ehp/us/77';
const ev = (o) => ({ kind: 'สถานะ', link: URL, from: 'New', to: 'In progress', by: 'แดง', at: 1000, ...o });
const row = (seq, o = {}) =>
  D.enrich(
    { rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'รอทีมพัฒนา', ticketLinks: [URL], ...o },
    d(2026, 11, 24),
  );

describe('taigaKey', () => {
  it('identifies an item by site, project, type and number', () => {
    expect(D.taigaKey(URL)).toBe(KEY);
    expect(D.taigaKey('https://TAIGA.hosxp.net/project/EHP/us/77?x=1')).toBe(KEY);
  });

  it('is null without a full item link, so a bare number never matches across projects', () => {
    ['77', '', null, 'https://taiga.hosxp.net/us/77', 'https://taiga.hosxp.net/login'].forEach((u) =>
      expect(D.taigaKey(u)).toBeNull(),
    );
  });
});

describe('taigaLatest', () => {
  it('keeps the newest status and who moved it', () => {
    const l = D.taigaLatest([
      ev(),
      ev({ from: 'In progress', to: 'Done', kind: 'เสร็จ', by: 'ดำ', at: 2000 }),
    ]);
    expect(l[KEY]).toEqual({ status: 'Done', from: 'In progress', by: 'ดำ', at: 2000, deleted: false });
  });

  it('a later comment does not change who moved the card', () => {
    const l = D.taigaLatest([
      ev(),
      ev({ kind: 'คอมเมนต์', from: '', to: 'In progress', by: 'ดำ', at: 2000 }),
    ]);
    expect(l[KEY]).toMatchObject({ status: 'In progress', by: 'แดง', at: 1000 });
  });

  it('marks a deleted item and ignores test events and events without a full link', () => {
    expect(D.taigaLatest([ev(), ev({ kind: 'ลบ' })])[KEY].deleted).toBe(true);
    expect(D.taigaLatest([ev({ kind: 'ทดสอบ' }), ev({ link: '' })])).toEqual({});
  });
});

describe('taigaCompare', () => {
  const latest = D.taigaLatest([ev()]);
  const map = { 'In progress': 'กำลังพัฒนา' };
  const cmp = (r, m = map, rows = [r], l = latest) => D.taigaCompare(r, l, m, D.taigaKeyCounts(rows));

  it('says when the sheet differs from Taiga and what it should be', () => {
    expect(cmp(row(1))).toMatchObject({ state: 'diff', expected: 'กำลังพัฒนา', canApply: true });
  });

  it('matches when the sheet already has the mapped status', () => {
    expect(cmp(row(1, { status: 'กำลังพัฒนา' }))).toMatchObject({ state: 'match', canApply: false });
  });

  it('never guesses: no map entry, an invalid target or an inherited name is "unmapped"', () => {
    expect(cmp(row(1), {}).state).toBe('unmapped');
    expect(cmp(row(1), { 'In progress': 'ไม่มีสถานะนี้' }).state).toBe('unmapped');
    const odd = D.taigaLatest([ev({ to: 'constructor' })]);
    expect(cmp(row(1), {}, [row(1)], odd).state).toBe('unmapped');
  });

  it('has nothing to say without an event or a full link', () => {
    expect(cmp(row(1, { ticketLinks: [] })).state).toBe('none');
    expect(cmp(row(1), map, [row(1)], {}).state).toBe('none');
  });

  it('a deleted Taiga item is shown but never applied', () => {
    const gone = D.taigaLatest([ev(), ev({ kind: 'ลบ' })]);
    expect(cmp(row(1), map, [row(1)], gone)).toMatchObject({ state: 'deleted', canApply: false });
  });

  it('two rows with the same Taiga link are shown but cannot be applied', () => {
    const rows = [row(1), row(2)];
    expect(cmp(rows[0], map, rows)).toMatchObject({ state: 'diff', canApply: false, duplicate: true });
  });

  it('a row without a usable ลำดับ cannot be applied', () => {
    expect(cmp(row(1, { seq: '' }))).toMatchObject({ state: 'diff', canApply: false });
  });
});
