// The app reads the bot's Taiga log (never writes it) and keeps its own status map in _app_taiga_map (2026-11-24).
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const HEAD = [
  'เวลา',
  'ชนิด',
  'ประเภท',
  'ref',
  'หัวข้อ',
  'จาก',
  'เป็น',
  'โดย',
  'ลิงก์',
  'คอมเมนต์',
  'เปลี่ยนอะไร',
];
const LINK = 'https://taiga.hosxp.net/project/ehp/us/77';
const KEY = 'taiga.hosxp.net/ehp/us/77';
const event = (o = {}) => {
  const e = {
    เวลา: new Date(5000),
    ชนิด: 'สถานะ',
    ประเภท: 'US',
    ref: 77,
    จาก: 'New',
    เป็น: 'Step X',
    โดย: 'แดง',
    ลิงก์: LINK,
    ...o,
  };
  return HEAD.map((h) => (e[h] === undefined ? '' : e[h]));
};

let ss, log, lock;
const build = (logRows) => {
  const sheets = [
    new FakeSheet(Config.SHEETS.main, [Domain.COLUMNS.map((c) => c.header)]),
    new FakeSheet(Config.SHEETS.allowed, [
      Config.ALLOWED_HEADERS.slice(),
      ['admin@x.com', '', '', Config.ROLE.admin, Config.ACCESS.allowed],
      ['editor@x.com', '', '', Config.ROLE.editor, Config.ACCESS.allowed],
    ]),
  ];
  log = null;
  if (logRows) sheets.push((log = new FakeSheet('_แมวส้ม_Taiga', logRows)));
  ss = new FakeSpreadsheet(sheets);
  lock = new FakeLock();
  return makeRepo({
    ss,
    getLock: () => lock,
    cache: new FakeCache(),
    nowText: () => '24/11/2026 10:00:00',
    makeDate: () => null,
  });
};

/** Pairs other than the built-in team table. */
const own = (map) =>
  Object.fromEntries(Object.entries(map).filter(([k]) => !(k in Domain.TAIGA_DEFAULT_MAP)));

describe("taiga(): read the bot's Taiga log", () => {
  it('returns the newest status per item, the statuses seen and the map, and writes nothing', () => {
    const repo = build([
      HEAD,
      event(),
      event({ เวลา: new Date(9000), จาก: 'Step X', เป็น: 'Step Y', ชนิด: 'เสร็จ' }),
    ]);
    const t = repo.taiga();
    expect(t.available).toBe(true);
    expect(t.latest[KEY]).toEqual({
      status: 'Step Y',
      from: 'Step X',
      by: 'แดง',
      at: 9000,
      deleted: false,
    });
    expect(t.statuses.slice().sort()).toEqual(['Step X', 'Step Y']);
    expect(own(t.map)).toEqual({});
    expect(log.writes).toEqual([]);
    expect(ss.getSheetByName(Config.SHEETS.taigaMap)).toBeFalsy();
  });

  it('finds columns by header, not position', () => {
    const repo = build([HEAD.slice().reverse(), event().reverse()]);
    expect(repo.taiga().latest[KEY].status).toBe('Step X');
  });

  it('is simply unavailable when the log is missing or has another layout', () => {
    expect(build(null).taiga()).toMatchObject({ available: false, latest: {} });
    expect(
      build([
        ['a', 'b'],
        [1, 2],
      ]).taiga(),
    ).toMatchObject({ available: false, latest: {} });
  });

  it('an empty log is available with no items', () => {
    expect(build([HEAD]).taiga()).toMatchObject({ available: true, latest: {}, statuses: [] });
  });
});

describe("saveTaigaMap(): admins only, in the app's own sheet", () => {
  let repo;
  beforeEach(() => {
    repo = build([HEAD, event()]);
  });
  const save = (input, who = 'admin@x.com') => repo.saveTaigaMap(who, 'owner@x.com', input);

  it('adds, changes and clears a pair, and logs each change', () => {
    expect(save({ taiga: 'Step X', app: 'กำลังพัฒนา' }).ok).toBe(true);
    expect(own(repo.taiga().map)).toEqual({ 'Step X': 'กำลังพัฒนา' });
    expect(save({ taiga: 'Step X', app: 'กำลังทดสอบ' }).ok).toBe(true);
    expect(own(repo.taiga().map)).toEqual({ 'Step X': 'กำลังทดสอบ' });
    expect(save({ taiga: 'Step X', app: '' }).ok).toBe(true);
    expect(own(repo.taiga().map)).toEqual({});
    expect(ss.getSheetByName(Config.SHEETS.taigaMap).getLastRow()).toBe(2); // one row per Taiga status
    const logged = ss
      .getSheetByName(Config.SHEETS.log)
      .getDataRange()
      .getDisplayValues()
      .filter((r) => r[2] === 'TAIGA_MAP');
    expect(logged.map((r) => [r[1], r[5], r[6], r[7]])).toEqual([
      ['admin@x.com', 'Step X', '', 'กำลังพัฒนา'],
      ['admin@x.com', 'Step X', 'กำลังพัฒนา', 'กำลังทดสอบ'],
      ['admin@x.com', 'Step X', 'กำลังทดสอบ', ''],
    ]);
    expect(log.writes).toEqual([]);
  });

  it('clearing a built-in pair is remembered, and choosing it again is too', () => {
    expect(repo.taiga().map.Done).toBe('0.แก้ไขเรียบร้อย');
    expect(save({ taiga: 'Done', app: '0.แก้ไขเรียบร้อย' }).ok).toBe(true); // already so: nothing to write
    expect(ss.getSheetByName(Config.SHEETS.taigaMap)).toBeFalsy();
    expect(save({ taiga: 'Done', app: '' }).ok).toBe(true);
    expect(repo.taiga().map).not.toHaveProperty('Done');
    expect(save({ taiga: 'Done', app: '0.แก้ไขเรียบร้อย' }).ok).toBe(true);
    expect(repo.taiga().map.Done).toBe('0.แก้ไขเรียบร้อย');
  });

  it('refuses non-admins, unknown app statuses and empty Taiga names', () => {
    expect(save({ taiga: 'Step X', app: 'กำลังพัฒนา' }, 'editor@x.com').code).toBe('NOT_ADMIN');
    expect(save({ taiga: 'Step X', app: 'ไม่มีสถานะนี้' }).code).toBe('VALIDATION');
    expect(save({ taiga: ' ', app: 'กำลังพัฒนา' }).code).toBe('VALIDATION');
    expect(ss.getSheetByName(Config.SHEETS.taigaMap)).toBeFalsy();
  });

  it('a hand-typed target that is not a workflow status is ignored', () => {
    save({ taiga: 'Step X', app: 'กำลังพัฒนา' });
    ss.getSheetByName(Config.SHEETS.taigaMap)._set(2, 2, 'พิมพ์เอง');
    expect(own(repo.taiga().map)).toEqual({});
  });

  it('a name that looks like a formula is stored as text', () => {
    save({ taiga: '=1+1', app: 'กำลังพัฒนา' });
    expect(own(repo.taiga().map)).toEqual({ '=1+1': 'กำลังพัฒนา' });
  });

  it('writes nothing when the lock is busy', () => {
    lock.tryLock = () => false;
    expect(save({ taiga: 'Step X', app: 'กำลังพัฒนา' }).code).toBe('LOCK_TIMEOUT');
    expect(ss.getSheetByName(Config.SHEETS.taigaMap)).toBeFalsy();
  });
});

describe('saveStatusTaiga(): sheet status → Taiga status, admins only (2026-11-25)', () => {
  const A = '0.รอแจ้งทีมพัฒนา';
  let repo;
  beforeEach(() => {
    repo = build([HEAD, event()]);
  });
  const save = (input, who = 'admin@x.com') => repo.saveStatusTaiga(who, 'owner@x.com', input);
  const sheet = () => ss.getSheetByName('_app_status_taiga');

  it('adds, changes and clears a pair, logs each change and leaves everything else alone', () => {
    expect(repo.taiga().appMap).toEqual({});
    expect(save({ app: A, taiga: 'Step X' })).toMatchObject({ ok: true });
    expect(repo.taiga().appMap).toEqual({ [A]: 'Step X' });
    expect(save({ app: A, taiga: 'Ready for DEV' }).ok).toBe(true);
    expect(repo.taiga().appMap).toEqual({ [A]: 'Ready for DEV' });
    expect(save({ app: A, taiga: '' }).ok).toBe(true);
    expect(repo.taiga().appMap).toEqual({});
    expect(sheet().getLastRow()).toBe(2); // one row per sheet status
    const logged = ss
      .getSheetByName(Config.SHEETS.log)
      .getDataRange()
      .getDisplayValues()
      .filter((r) => r[2] === 'STATUS_TAIGA');
    expect(logged.map((r) => [r[1], r[5], r[6], r[7]])).toEqual([
      ['admin@x.com', A, '', 'Step X'],
      ['admin@x.com', A, 'Step X', 'Ready for DEV'],
      ['admin@x.com', A, 'Ready for DEV', ''],
    ]);
    expect(log.writes).toEqual([]);
    expect(ss.getSheetByName(Config.SHEETS.taigaMap)).toBeFalsy();
  });

  it('saving the same pair again, or clearing what is not set, writes nothing', () => {
    expect(save({ app: A, taiga: '' }).ok).toBe(true);
    expect(sheet()).toBeFalsy();
    save({ app: A, taiga: 'Step X' });
    save({ app: A, taiga: 'Step X' });
    expect(sheet().getLastRow()).toBe(2);
  });

  it('refuses non-admins, statuses outside the workflow and Taiga names never seen', () => {
    expect(save({ app: A, taiga: 'Step X' }, 'editor@x.com').code).toBe('NOT_ADMIN');
    expect(save({ app: 'ไม่มีสถานะนี้', taiga: 'Step X' }).code).toBe('VALIDATION');
    expect(save({ app: '', taiga: 'Step X' }).code).toBe('VALIDATION');
    expect(save({ app: A, taiga: 'พิมพ์เอง' }).code).toBe('VALIDATION');
    expect(sheet()).toBeFalsy();
  });

  it('writes nothing when the lock is busy', () => {
    lock.tryLock = () => false;
    expect(save({ app: A, taiga: 'Step X' }).code).toBe('LOCK_TIMEOUT');
    expect(sheet()).toBeFalsy();
  });

  it('a missing Taiga log still returns the pairs', () => {
    expect(build(null).taiga()).toMatchObject({ available: false, appMap: {} });
  });
});

describe('sending a status to Taiga: check before, log after (2026-11-25)', () => {
  const C = Domain.COLUMNS;
  let repo, main;
  const add = (o) => main.appendRow(C.map((c) => o[c.key] || ''));
  beforeEach(() => {
    repo = build([HEAD, event()]);
    main = ss.getSheetByName(Config.SHEETS.main);
    add({ seq: '7', detail: 'งาน', status: 'กำลังทดสอบ' });
    add({ seq: '8', detail: 'งาน', status: 'กำลังพัฒนา' });
    add({ seq: '8', detail: 'ซ้ำ', status: 'กำลังพัฒนา' });
    main.writes.length = 0;
  });

  it('the check passes only while the row is still the item with that status', () => {
    expect(repo.checkTaigaPush({ rowNumber: 2, seq: 7, status: 'กำลังทดสอบ' }).ok).toBe(true);
    expect(repo.checkTaigaPush({ rowNumber: 2, seq: 7, status: 'กำลังพัฒนา' }).code).toBe('CONFLICT');
    expect(repo.checkTaigaPush({ rowNumber: 2, seq: 9, status: 'กำลังทดสอบ' }).code).toBe('SEQ_MISMATCH');
    expect(repo.checkTaigaPush({ rowNumber: 3, seq: 8, status: 'กำลังพัฒนา' }).code).toBe('SEQ_INVALID');
    expect(repo.checkTaigaPush({ rowNumber: 99, seq: 7, status: 'กำลังทดสอบ' }).code).toBe('NOT_FOUND');
    expect(repo.checkTaigaPush(undefined).code).toBe('NOT_FOUND');
    expect(main.writes).toEqual([]);
  });

  it('logs who sent what and shows it in the item history', () => {
    const req = { rowNumber: 2, seq: 7, from: 'In progress', to: '=Ready for test' };
    expect(repo.logTaigaPush(req, 'editor@x.com').ok).toBe(true);
    expect(repo.history(7)).toEqual([
      {
        time: '24/11/2026 10:00:00',
        who: 'editor@x.com',
        action: 'TAIGA_PUSH',
        column: 'สถานะใน Taiga',
        from: 'In progress',
        to: '=Ready for test',
      },
    ]);
    expect(main.writes).toEqual([]);
    expect(log.writes).toEqual([]);
  });

  it('refuses a log line without a ลำดับ or a status, or with an overlong name', () => {
    expect(repo.logTaigaPush({ rowNumber: 2, seq: 'x', from: 'a', to: 'b' }, 'e').code).toBe('VALIDATION');
    expect(repo.logTaigaPush({ rowNumber: 2, seq: 7, from: 'a', to: ' ' }, 'e').code).toBe('VALIDATION');
    expect(repo.logTaigaPush({ rowNumber: 2, seq: 7, from: 'a', to: 'b'.repeat(101) }, 'e').code).toBe(
      'VALIDATION',
    );
    expect(repo.logTaigaPush(undefined, 'e').code).toBe('VALIDATION');
    expect(ss.getSheetByName(Config.SHEETS.log)).toBeFalsy();
  });
});
