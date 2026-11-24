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

describe('taigaEffectiveMap: the team table (user, 2026-11-24) unless an admin changed it', () => {
  it('has the pairs the team gave, with the exact sheet spellings', () => {
    expect(D.taigaEffectiveMap([], [])).toEqual({
      New: '0.จัดทำ Taiga',
      'PM Reviewing': 'รอ PM ตรวจสอบ Taiga',
      'Ready for DEV': 'รอทีมพัฒนา',
      'In progress': 'กำลังพัฒนา',
      'Ready for test': 'กำลังทดสอบ',
      Rework: 'ส่งกลับนักพัฒนาแก้ไข',
      'Waiting Compile': 'รอ compile',
      'compile from dev': 'รอ compile',
      Done: '0.แก้ไขเรียบร้อย',
      Archived: '0.ยกเลิก',
    });
    Object.values(D.taigaEffectiveMap([], [])).forEach((v) => expect(D.WORKFLOW).toContain(v));
  });

  it('matches names as Taiga spells them, ignoring only case and extra spaces', () => {
    const m = D.taigaEffectiveMap(['READY FOR  dev', 'Compile From Dev', 'Ready'], []);
    expect(m['READY FOR  dev']).toBe('รอทีมพัฒนา');
    expect(m['Compile From Dev']).toBe('รอ compile');
    expect(m['Ready for DEV']).toBeUndefined(); // listed once, under Taiga's own spelling
    expect(m.Ready).toBeUndefined(); // similar is not the same
  });

  it('an admin can change or clear a pair, and an invalid target counts as cleared', () => {
    const m = D.taigaEffectiveMap(
      ['Done'],
      [
        { taiga: 'Done', app: 'รอ compile' },
        { taiga: 'Archived', app: '' },
        { taiga: 'New', app: 'พิมพ์เอง' },
        { taiga: 'Extra', app: 'กำลังทดสอบ' },
      ],
    );
    expect(m.Done).toBe('รอ compile');
    expect(m).not.toHaveProperty('Archived');
    expect(m).not.toHaveProperty('New');
    expect(m.Extra).toBe('กำลังทดสอบ');
  });

  it('a pair saved under another letter case still wins over the default', () => {
    expect(D.taigaEffectiveMap(['done'], [{ taiga: 'Done', app: '' }])).not.toHaveProperty('done');
  });
});
