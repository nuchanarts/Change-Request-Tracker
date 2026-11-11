// Notification queue for แมวส้ม, per-item history, and restoring deleted rows (2026-11-11).
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const HEADERS = Domain.COLUMNS.map((c) => c.header);
const col = (key) => Domain.COLUMNS.findIndex((c) => c.key === key) + 1;
const line = (seq, o = {}) => {
  const r = new Array(HEADERS.length).fill('');
  r[col('seq') - 1] = seq;
  r[col('detail') - 1] = 'งาน ' + seq;
  r[col('status') - 1] = 'กำลังพัฒนา';
  r[col('pm') - 1] = 'นุชนารถ (แก๊ส)';
  Object.entries(o).forEach(([k, v]) => (r[col(k) - 1] = v));
  return r;
};
const snapshotOf = (main, rowNumber) => {
  const out = {};
  Domain.COLUMNS.forEach((c) => (out[c.key] = String(main.cells[rowNumber - 1][col(c.key) - 1] ?? '')));
  return out;
};

let main, ss, lock, repo, clock;
beforeEach(() => {
  main = new FakeSheet(Config.SHEETS.main, [
    HEADERS.slice(),
    line(1),
    line(2, { developer: 'แดง', dueDate: '16/4/2026' }),
    line(3),
  ]);
  ss = new FakeSpreadsheet([main]);
  lock = new FakeLock();
  clock = 0;
  repo = makeRepo({
    ss,
    getLock: () => lock,
    cache: new FakeCache(),
    nowText: () => '11/11/2026 10:00:0' + clock++,
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
});

describe('enqueueNotify (queue read by แมวส้ม)', () => {
  it('adds one pending row per message under a key, and never twice for the same key', () => {
    expect(repo.enqueueNotify('digest:2026-11-16', 'สรุปรายสัปดาห์', ['ข้อความ 1', 'ข้อความ 2'])).toEqual({
      ok: true,
      data: { added: 2 },
    });
    const q = ss.getSheetByName(Config.SHEETS.notify);
    expect(q.cells[0]).toEqual(Config.NOTIFY_HEADERS);
    expect(q.cells.slice(1).map((r) => [r[0], r[2], r[3], r[4]])).toEqual([
      ['digest:2026-11-16#1', 'สรุปรายสัปดาห์', 'ข้อความ 1', 'รอส่ง'],
      ['digest:2026-11-16#2', 'สรุปรายสัปดาห์', 'ข้อความ 2', 'รอส่ง'],
    ]);
    expect(q.hidden).toBe(true);
    expect(repo.enqueueNotify('digest:2026-11-16', 'สรุปรายสัปดาห์', ['อีกครั้ง'])).toEqual({
      ok: true,
      data: { added: 0 },
    });
    expect(q.cells).toHaveLength(3);
  });

  it('a message that looks like a formula is stored as text', () => {
    repo.enqueueNotify('k', 'x', ['=IMPORTXML("http://evil")']);
    expect(ss.getSheetByName(Config.SHEETS.notify).cells[1][3]).toBe('=IMPORTXML("http://evil")');
    expect(ss.getSheetByName(Config.SHEETS.notify).writes.some((w) => String(w.value).startsWith("'="))).toBe(
      true,
    );
  });
});

describe('history', () => {
  it('returns the log entries of one ลำดับ, newest first, without the big delete snapshot', () => {
    repo.update({ rowNumber: 3, seq: 2, changes: { developer: { from: 'แดง', to: 'ดำ' } } }, 'a@x.com');
    repo.update(
      { rowNumber: 3, seq: 2, changes: { status: { from: 'กำลังพัฒนา', to: 'กำลังทดสอบ' } } },
      'b@x.com',
    );
    repo.update({ rowNumber: 2, seq: 1, changes: { developer: { from: '', to: 'แดง' } } }, 'a@x.com');
    const h = repo.history(2);
    expect(h.map((e) => [e.action, e.column, e.from, e.to, e.who])).toEqual([
      ['UPDATE', 'สถานะ', 'กำลังพัฒนา', 'กำลังทดสอบ', 'b@x.com'],
      ['UPDATE', 'นักพัฒนา', 'แดง', 'ดำ', 'a@x.com'],
    ]);
    repo.remove({ rowNumber: 3, seq: 2, snapshot: snapshotOf(main, 3) }, 'a@x.com');
    expect(repo.history(2)[0]).toMatchObject({ action: 'DELETE', from: '', to: '' });
  });

  it('is empty when there is no log yet', () => {
    expect(repo.history(1)).toEqual([]);
  });
});

describe('listDeleted / restore', () => {
  beforeEach(() => {
    repo.remove({ rowNumber: 3, seq: 2, snapshot: snapshotOf(main, 3) }, 'a@x.com');
  });

  it('lists deleted items that are not back in the sheet', () => {
    const list = repo.listDeleted();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ seq: 2, detail: 'งาน 2', who: 'a@x.com', time: '11/11/2026 10:00:00' });
    expect(list[0].logRow).toBe(2);
  });

  it('restores the row at the bottom with the same ลำดับ and values, logs it, and drops it from the list', () => {
    const res = repo.restore(2, 'admin@x.com');
    expect(res).toEqual({ ok: true, data: { rowNumber: 4, seq: 2 } });
    const back = main.cells[3];
    expect(back[col('seq') - 1]).toBe(2);
    expect(back[col('detail') - 1]).toBe('งาน 2');
    expect(back[col('developer') - 1]).toBe('แดง');
    expect(String(back[col('dueDate') - 1])).toMatch(/16\/4\/2026|2026/);
    const log = ss.getSheetByName(Config.SHEETS.log).cells;
    expect(log[log.length - 1].slice(2, 6)).toEqual(['RESTORE', 4, 2, '(ทั้งแถว)']);
    expect(repo.listDeleted()).toEqual([]);
  });

  it('refuses when the ลำดับ is already used, or the log row is not a delete', () => {
    repo.restore(2, 'admin@x.com');
    expect(repo.restore(2, 'admin@x.com')).toMatchObject({ ok: false, code: 'SEQ_TAKEN' });
    expect(repo.restore(1, 'admin@x.com')).toMatchObject({ ok: false, code: 'NOT_DELETED' });
    expect(repo.restore(99, 'admin@x.com')).toMatchObject({ ok: false, code: 'NOT_DELETED' });
  });

  it('writes text that looks like a formula as text', () => {
    main.cells[1][col('detail') - 1] = '=HYPERLINK("http://evil","x")';
    repo.remove({ rowNumber: 2, seq: 1, snapshot: snapshotOf(main, 2) }, 'a@x.com');
    const logRow = repo.listDeleted().find((d) => d.seq === 1).logRow;
    main.writes = [];
    repo.restore(logRow, 'admin@x.com');
    expect(main.writes.some((w) => w.value === '\'=HYPERLINK("http://evil","x")')).toBe(true);
  });

  it('returns LOCK_TIMEOUT without writing when the lock is busy', () => {
    lock = new FakeLock({ available: false });
    expect(repo.restore(2, 'admin@x.com')).toMatchObject({ ok: false, code: 'LOCK_TIMEOUT' });
  });
});
