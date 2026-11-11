// Regression tests for the 2026-11-11 code-review findings on the real-sheet write path.
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
  const r = HEADERS.map(() => '');
  Object.assign(r, {
    [col('seq') - 1]: seq,
    [col('detail') - 1]: 'งาน ' + seq,
    [col('status') - 1]: 'กำลังพัฒนา',
  });
  Object.entries(o).forEach(([k, v]) => (r[col(k) - 1] = v));
  return r;
};

let main, ss, cache, userCache, repo;
let effective = null; // email the script is running as (USER_ACCESSING → the caller)
const build = (opts = {}) => {
  main = new FakeSheet(Config.SHEETS.main, [
    HEADERS.slice(),
    line(1, { ticket: 'https://taiga/x' }),
    line(2),
  ]);
  ss = new FakeSpreadsheet([main], { editors: ['editor@x.com'], viewers: ['viewer@x.com'], ...opts });
  cache = new FakeCache();
  userCache = new FakeCache();
  repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache,
    userCache,
    effectiveEmail: () => effective,
    nowText: () => '11/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
};
beforeEach(() => build());

const input = {
  platform: 'EHP',
  issueType: 'defect',
  urgency: 'ปกติ',
  status: '0.รอแจ้งทีมพัฒนา',
  system: 'ระบบ',
  detail: '=SUM(A1:A9) ไม่ใช่สูตร',
  pm: 'PM',
  ticket: '0012',
  dueDate: '5/4/2026',
};

describe('text values are stored exactly as typed (constitution III)', () => {
  it('keeps leading zeros, "=" text and d/m/yyyy text instead of letting Sheets reinterpret them', () => {
    const res = repo.create(input, 'editor@x.com');
    expect(res.ok).toBe(true);
    const last = main.cells[main.cells.length - 1];
    expect(last[col('ticket') - 1]).toBe('0012');
    expect(last[col('detail') - 1]).toBe('=SUM(A1:A9) ไม่ใช่สูตร');
    expect(last[col('dueDate') - 1]).toBe('5/4/2026'); // column holds text here → stays text, not 4 May
    expect(last[col('seq') - 1]).toBe(3); // numbers stay numbers
  });

  it('updates keep text too', () => {
    repo.update({ rowNumber: 3, seq: 2, changes: { ticket: { from: '', to: '0099' } } }, 'editor@x.com');
    expect(main.cells[2][col('ticket') - 1]).toBe('0099');
  });

  it('_app_log values are stored as text', () => {
    repo.create(input, 'editor@x.com');
    const log = ss.getSheetByName(Config.SHEETS.log).cells;
    const ticketRow = log.find((r) => r[5] === 'ข้อมูลลิงค์ Taiga หรือ MANTIS');
    expect(ticketRow[7]).toBe('0012');
    expect(log.find((r) => r[5] === 'รายละเอียด')[7]).toBe(input.detail);
  });
});

describe('partial failures are still logged (constitution V)', () => {
  it('logs the cells that were written before an error, then reports the error', () => {
    main.failOnWrite = (row, c) => row === 3 && c === col('developer');
    expect(() =>
      repo.update(
        {
          rowNumber: 3,
          seq: 2,
          changes: { status: { from: 'กำลังพัฒนา', to: 'รอ compile' }, developer: { from: '', to: 'X' } },
        },
        'editor@x.com',
      ),
    ).toThrow();
    const log = ss.getSheetByName(Config.SHEETS.log).cells;
    expect(log.length).toBe(2); // header + the status change that did happen
    expect(log[1].slice(5)).toEqual(['สถานะ', 'กำลังพัฒนา', 'รอ compile']);
  });

  it('rejects unknown or inherited keys before writing anything', () => {
    main.writes = [];
    const res = repo.update(
      { rowNumber: 3, seq: 2, changes: { constructor: { from: '', to: 'x' } } },
      'e@x.com',
    );
    expect(res).toMatchObject({ ok: false, code: 'VALIDATION' });
    expect(main.writes).toEqual([]);
  });
});

describe('canEdit covers group and link sharing (R8)', () => {
  it('listed editors: yes without probing; listed viewers: no without probing', () => {
    expect(repo.canEdit('editor@x.com')).toBe(true);
    expect(repo.canEdit('viewer@x.com')).toBe(false);
    expect(ss.probes).toBe(0);
  });

  it('unlisted users are probed once with harmless developer metadata, result cached per user', () => {
    build({ probeAllowed: true });
    effective = 'groupmember@x.com';
    expect(repo.canEdit('groupmember@x.com')).toBe(true);
    expect(repo.canEdit('groupmember@x.com')).toBe(true);
    expect(ss.probes).toBe(1);
  });

  it('never probes when the script is not running as the caller (fail closed if deployed "execute as me")', () => {
    build({ probeAllowed: true });
    effective = 'owner@x.com';
    expect(repo.canEdit('groupmember@x.com')).toBe(false);
    expect(ss.probes).toBe(0);
  });

  it('a failed probe means view-only', () => {
    build({ probeAllowed: false });
    effective = 'linkviewer@x.com';
    expect(repo.canEdit('linkviewer@x.com')).toBe(false);
  });
});

describe('fewer full-sheet reads (constitution XIV)', () => {
  it('readAll uses display values only', () => {
    const range = main.getDataRange();
    let valuesCalls = 0;
    main.getDataRange = () => Object.assign(range, { getValues: () => (valuesCalls++, []) });
    repo.readAll();
    expect(valuesCalls).toBe(0);
  });

  it('options() reads rows itself only on a cache miss', () => {
    repo.options();
    let reads = 0;
    const orig = main.getDataRange.bind(main);
    main.getDataRange = () => (reads++, orig());
    repo.options();
    expect(reads).toBe(0);
  });
});
