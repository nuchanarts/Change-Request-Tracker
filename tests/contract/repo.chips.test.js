// Regression (production 2026-11-11): a leading apostrophe on every string broke the coloured dropdown
// chips in the sheet. Only values Sheets would reinterpret get the apostrophe; an admin repair rewrites
// option cells the app wrote earlier.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const HEADERS = Domain.COLUMNS.map((c) => c.header);
const col = (k) => Domain.COLUMNS.findIndex((c) => c.key === k) + 1;
const line = (seq, o = {}) => {
  const r = HEADERS.map(() => '');
  Object.assign(r, {
    [col('seq') - 1]: seq,
    [col('detail') - 1]: 'งาน ' + seq,
    [col('status') - 1]: 'กำลังพัฒนา',
  });
  Object.entries(o).forEach(([k, v]) => (r[col(k) - 1] = v));
  return r;
};
let ss, main, repo;
beforeEach(() => {
  main = new FakeSheet(Config.SHEETS.main, [HEADERS.slice(), line(1), line(2)]);
  ss = new FakeSpreadsheet([main], { editors: ['boss@x.com'] });
  repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    userCache: new FakeCache(),
    effectiveEmail: () => 'boss@x.com',
    nowText: () => '11/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
});

describe('which values get an apostrophe', () => {
  it('dropdown values (status, platform, urgency, PM, system) are written as plain text', () => {
    main.writes = [];
    repo.update(
      { rowNumber: 2, seq: 1, changes: { status: { from: 'กำลังพัฒนา', to: 'รอทีมพัฒนา' } } },
      'boss@x.com',
    );
    expect(main.writes).toEqual([{ row: 2, col: col('status'), value: 'รอทีมพัฒนา' }]);
    repo.create(
      {
        platform: 'EHP',
        issueType: 'defect',
        urgency: 'ด่วน',
        status: '0.รอแจ้งทีมพัฒนา',
        system: 'Inventory',
        detail: 'x',
        pm: 'วนิดา (แพท)',
        dueDate: '1/12/2026',
      },
      'boss@x.com',
    );
    const last = main.cells[main.cells.length - 1];
    expect(main.writes.filter((w) => w.row === main.cells.length).map((w) => w.value)).toContain(
      '0.รอแจ้งทีมพัฒนา',
    );
    expect(last[col('urgency') - 1]).toBe('ด่วน');
  });

  it('values Sheets would reinterpret still get one: digits only, date-like, formula-like', () => {
    main.writes = [];
    repo.update(
      {
        rowNumber: 2,
        seq: 1,
        changes: { ticket: { from: '', to: '0012' }, detail: { from: 'งาน 1', to: '=SUM(A1)' } },
      },
      'boss@x.com',
    );
    expect(main.writes.map((w) => w.value)).toEqual(["'0012", "'=SUM(A1)"]);
    expect(main.cells[1][col('ticket') - 1]).toBe('0012');
  });
});

describe('repairQuotedOptions (admin)', () => {
  it('rewrites option cells the app logged, only where the value is unchanged, and logs it', () => {
    // simulate v1.1.0–v1.5.0 writes: logged UPDATE of status/urgency for ลำดับ 1 and 2
    const log = ss.insertSheet(Config.SHEETS.log);
    log.cells = [
      Config.LOG_HEADERS.slice(),
      ['t', 'a@x.com', 'UPDATE', 2, 1, 'สถานะ', 'กำลังพัฒนา', 'กำลังพัฒนา'],
      ['t', 'a@x.com', 'UPDATE', 3, 2, 'สถานะ', 'x', 'รอ compile'], // someone changed it since → skip
      ['t', 'a@x.com', 'UPDATE', 2, 1, 'รายละเอียด', 'x', 'งาน 1'], // not an option column → skip
    ];
    main.writes = [];
    const res = repo.repairQuotedOptions('boss@x.com', 'boss@x.com');
    expect(res).toEqual({ ok: true, data: { repaired: 1, skipped: 1 } });
    expect(main.writes).toEqual([{ row: 2, col: col('status'), value: 'กำลังพัฒนา' }]);
    expect(log.cells[log.cells.length - 1][2]).toBe('REPAIR_CHIPS');
  });

  it('finds rows by ลำดับ even if the sheet was sorted since', () => {
    const log = ss.insertSheet(Config.SHEETS.log);
    log.cells = [Config.LOG_HEADERS.slice(), ['t', 'a@x.com', 'UPDATE', 2, 2, 'สถานะ', 'x', 'กำลังพัฒนา']];
    main.writes = [];
    repo.repairQuotedOptions('boss@x.com', 'boss@x.com');
    expect(main.writes).toEqual([{ row: 3, col: col('status'), value: 'กำลังพัฒนา' }]);
  });

  it('is admin-only', () => {
    const r2 = makeRepo({ ss, getLock: () => new FakeLock(), nowText: () => '', makeDate: () => null });
    ss.editors = [];
    expect(r2.repairQuotedOptions('nobody@x.com', '')).toMatchObject({ ok: false, code: 'NOT_ADMIN' });
  });
});

describe('repair never writes formulas', () => {
  it('a logged free-text value that looks like a formula is written with an apostrophe', () => {
    main.cells[1][col('system') - 1] = '=HYPERLINK("x")';
    const log = ss.insertSheet(Config.SHEETS.log);
    log.cells = [
      Config.LOG_HEADERS.slice(),
      ['t', 'a@x.com', 'UPDATE', 2, 1, 'ระบบงาน', '', '=HYPERLINK("x")'],
    ];
    main.writes = [];
    repo.repairQuotedOptions('boss@x.com', 'boss@x.com');
    expect(main.writes).toEqual([{ row: 2, col: col('system'), value: '\'=HYPERLINK("x")' }]);
  });
});
