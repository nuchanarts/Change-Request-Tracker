// Delete a row for real (user decision 2026-11-11: "ลบแถวนั้นจริงได้ทุก login" — any editor).
// Safety kept: lock, ลำดับ + full-row conflict check, a full snapshot in _app_log for restore.
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

let main, ss, lock, cache, repo;
// what the client saw (raw display strings keyed by column key)
const snapshotOf = (rowNumber) => {
  const out = {};
  Domain.COLUMNS.forEach((c) => (out[c.key] = String(main.cells[rowNumber - 1][col(c.key) - 1] ?? '')));
  return out;
};

beforeEach(() => {
  main = new FakeSheet(Config.SHEETS.main, [
    HEADERS.slice(),
    line(1),
    line(2, { developer: 'แดง' }),
    line(3),
  ]);
  ss = new FakeSpreadsheet([main]);
  lock = new FakeLock();
  cache = new FakeCache();
  repo = makeRepo({
    ss,
    getLock: () => lock,
    cache,
    nowText: () => '11/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
});

describe('remove (delete a row)', () => {
  it('deletes the row, rows below move up, and logs a full snapshot for restore', () => {
    const snap = snapshotOf(3);
    const res = repo.remove({ rowNumber: 3, seq: 2, snapshot: snap }, 'editor@x.com');
    expect(res).toEqual({ ok: true, data: { rowNumber: 3, seq: 2 } });
    expect(main.deletes).toEqual([3]);
    expect(main.cells.map((r) => r[col('seq') - 1])).toEqual(['ลำดับ', 1, 3]);
    const log = ss.getSheetByName(Config.SHEETS.log);
    const entry = log.cells[1];
    expect(entry.slice(0, 6)).toEqual(['11/11/2026 10:00:00', 'editor@x.com', 'DELETE', 3, 2, '(ทั้งแถว)']);
    const saved = JSON.parse(entry[6]);
    expect(saved['รายละเอียด']).toBe('งาน 2');
    expect(saved['นักพัฒนา']).toBe('แดง');
    expect(Object.keys(saved)).toEqual(HEADERS); // every column, in sheet order
  });

  it('refuses when the row now holds another ลำดับ (rows moved) and deletes nothing', () => {
    expect(repo.remove({ rowNumber: 3, seq: 1, snapshot: snapshotOf(2) }, 'e@x.com')).toMatchObject({
      ok: false,
      code: 'SEQ_MISMATCH',
    });
    expect(main.deletes).toBeUndefined();
  });

  it('refuses with CONFLICT when someone changed the row since it was loaded', () => {
    const snap = snapshotOf(3);
    main.cells[2][col('status') - 1] = 'กำลังทดสอบ';
    expect(repo.remove({ rowNumber: 3, seq: 2, snapshot: snap }, 'e@x.com')).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      details: { status: { expected: 'กำลังพัฒนา', actual: 'กำลังทดสอบ' } },
    });
    expect(main.deletes).toBeUndefined();
  });

  it('refuses without a snapshot, for duplicate ลำดับ, outside the data, and when the lock is busy', () => {
    expect(repo.remove({ rowNumber: 3, seq: 2 }, 'e@x.com')).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(repo.remove({ rowNumber: 1, seq: 0, snapshot: {} }, 'e@x.com')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(repo.remove({ rowNumber: 99, seq: 2, snapshot: {} }, 'e@x.com')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    main.appendRow(line(2));
    expect(repo.remove({ rowNumber: 3, seq: 2, snapshot: snapshotOf(3) }, 'e@x.com')).toMatchObject({
      ok: false,
      code: 'SEQ_INVALID',
    });
    main.cells.pop();
    lock = new FakeLock({ available: false });
    expect(repo.remove({ rowNumber: 3, seq: 2, snapshot: snapshotOf(3) }, 'e@x.com')).toMatchObject({
      ok: false,
      code: 'LOCK_TIMEOUT',
    });
    expect(main.deletes).toBeUndefined();
  });

  it('does not log a delete that failed', () => {
    main.failOnDelete = true;
    expect(() => repo.remove({ rowNumber: 3, seq: 2, snapshot: snapshotOf(3) }, 'e@x.com')).toThrow();
    const log = ss.getSheetByName(Config.SHEETS.log);
    expect(log ? log.cells.length : 0).toBeLessThanOrEqual(1);
  });

  it('a stale update after a delete is refused instead of writing the wrong row', () => {
    repo.remove({ rowNumber: 3, seq: 2, snapshot: snapshotOf(3) }, 'e@x.com');
    main.writes = [];
    // a second browser still thinks ลำดับ 3 is on row 4
    expect(
      repo.update({ rowNumber: 4, seq: 3, changes: { developer: { from: '', to: 'แดง' } } }, 'x@x.com'),
    ).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(main.writes).toEqual([]);
  });
});
