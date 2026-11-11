import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache, FakeValidation } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');

const HEADERS = [
  'ลำดับ',
  'แพลตฟอร์ม',
  'ประเภทปัญหา',
  'ความเร่งด่วน',
  'สถานะ',
  'ระบบงาน',
  'รายละเอียด',
  'PM รับผิดชอบ',
  'ข้อมูลลิงค์ Taiga หรือ MANTIS',
  'วันที่ต้องได้',
  'นักพัฒนา',
  'วันที่เลื่อน',
  'วันที่เสร็จ',
  'วันที่ Deploy',
  'ลำดับการแก้ไข Dev',
  'ระยะเวลาพัฒนา(ชม.)',
  'เริ่มพัฒนา',
  'พัฒนาเสร็จ',
];
const col = (h) => HEADERS.indexOf(h) + 1;

const row = (seq, o = {}) => {
  const r = new Array(HEADERS.length).fill('');
  const set = (h, v) => (r[col(h) - 1] = v);
  set('ลำดับ', seq);
  set('แพลตฟอร์ม', 'EHP');
  set('ประเภทปัญหา', 'Requement');
  set('ความเร่งด่วน', 'ปกติ');
  set('สถานะ', 'กำลังพัฒนา');
  set('ระบบงาน', 'เวชระเบียน');
  set('รายละเอียด', 'งาน ' + seq);
  set('PM รับผิดชอบ', 'นุชนารถ (แก๊ส)');
  set('วันที่ต้องได้', new Date(2026, 3, 16));
  set('นักพัฒนา', 'เอิร์น');
  Object.entries(o).forEach(([h, v]) => set(h, v));
  return r;
};

let main, people, ss, lock, cache, repo;

beforeEach(() => {
  main = new FakeSheet(Config.SHEETS.main, [
    HEADERS.slice(),
    row(1),
    row(2, { 'ลำดับการแก้ไข Dev': 3 }),
    row(3, { รายละเอียด: '' }), // not an item
    row(7, { ระบบงาน: 'Dispensary', วันที่ต้องได้: '1/5/2026' }),
  ]);
  main.setValidation(
    2,
    col('แพลตฟอร์ม'),
    new FakeValidation('VALUE_IN_LIST', [['EHP', 'NHIP', 'INV', 'EHP Pharmacy']]),
  );
  people = new FakeSheet(Config.SHEETS.people, [
    ['ชื่อ', 'ตำแหน่ง'],
    ['นุชนารถ (แก๊ส)', 'PM'],
    ['เอิร์น', 'Dev'],
    ['กิ่ง', 'Dev'],
  ]);
  ss = new FakeSpreadsheet([main, people], { editors: ['editor@x.com'] });
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

describe('readAll', () => {
  it('maps columns by header text and returns raw display strings', () => {
    const res = repo.readAll();
    expect(res.missing).toEqual([]);
    expect(res.rows.map((r) => r.seq)).toEqual(['1', '2', '7']);
    expect(res.rows[0]).toMatchObject({
      rowNumber: 2,
      platform: 'EHP',
      dueDate: '16/4/2026',
      developer: 'เอิร์น',
    });
    expect(res.rows[2].rowNumber).toBe(5);
  });

  it('finds columns even when they are moved', () => {
    main.cells = main.cells.map((r) => [r[6], ...r.slice(0, 6), ...r.slice(7)]); // move รายละเอียด to column A
    expect(repo.readAll().rows[0].detail).toBe('งาน 1');
  });

  it('reports missing headers', () => {
    main.cells[0][col('สถานะ') - 1] = 'Status';
    expect(repo.readAll().missing).toEqual(['สถานะ']);
  });

  it('reads with one call per range (no per-cell reads)', () => {
    let calls = 0;
    const orig = main.getDataRange.bind(main);
    main.getDataRange = () => {
      calls++;
      return orig();
    };
    repo.readAll();
    expect(calls).toBe(1);
  });
});

describe('options (constitution III)', () => {
  it('prefers data validation, then distinct values, then รายชื่อ for people', () => {
    const o = repo.options(repo.readAll().rows);
    expect(o.platform).toEqual(['EHP', 'NHIP', 'INV', 'EHP Pharmacy']);
    expect(o.system).toEqual(['Dispensary', 'เวชระเบียน']);
    expect(o.urgency).toEqual(['ด่วนที่สุด', 'ด่วน', 'ปกติ']);
    expect(o.status[0]).toBe('0.จัดทำไฟล์แก้ไข'); // workflow order (PM-approved 2026-11-11)
    // รายชื่อ first, then any PM not already listed
    expect(o.person).toEqual([
      'นุชนารถ (แก๊ส)',
      'เอิร์น',
      'กิ่ง',
      'วนิดา (แพท)',
      'ทิพวรรณ (พี่ส้ม)',
      'กษิดิ์เดช (พี่ป้อง)',
    ]);
    // PM list set by the PM (2026-11-11), always these four in this order
    expect(o.pm).toEqual(['นุชนารถ (แก๊ส)', 'วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)', 'กษิดิ์เดช (พี่ป้อง)']);
    expect(o.person).toEqual(expect.arrayContaining(o.pm));
  });

  it('keeps the exact spelling of existing values', () => {
    main.appendRow(row(8, { ประเภทปัญหา: 'Requement' }));
    expect(repo.options(repo.readAll().rows).issueType).toContain('Requement');
  });

  it('caches option sets', () => {
    repo.options(repo.readAll().rows);
    expect(cache.get(Config.CACHE_KEYS.options)).not.toBeNull();
  });

  it('falls back to distinct names when รายชื่อ is missing', () => {
    delete ss.sheets[Config.SHEETS.people];
    expect(repo.options(repo.readAll().rows).person).toEqual(
      ['เอิร์น', 'นุชนารถ (แก๊ส)'].sort().concat(['วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)', 'กษิดิ์เดช (พี่ป้อง)']),
    );
  });
});

describe('create (constitution V)', () => {
  const input = {
    platform: 'NHIP',
    issueType: 'defect',
    urgency: 'ด่วน',
    status: '0.รอแจ้งทีมพัฒนา',
    system: 'เวชระเบียน',
    detail: 'ใหม่',
    pm: 'นุชนารถ (แก๊ส)',
    dueDate: '30/11/2026',
    deployDate: '1/12/2026',
  };

  it('appends at the bottom with ลำดับ = max + 1 under the lock and logs every field', () => {
    const res = repo.create(input, 'editor@x.com');
    expect(res).toEqual({ ok: true, data: { rowNumber: 6, seq: 8 } });
    const last = main.cells[5];
    expect(last[col('ลำดับ') - 1]).toBe(8);
    expect(last[col('แพลตฟอร์ม') - 1]).toBe('NHIP');
    expect(lock.acquired).toBe(1);
    expect(lock.held).toBe(false);
    const log = ss.getSheetByName(Config.SHEETS.log);
    expect(log.cells[0]).toEqual(Config.LOG_HEADERS);
    expect(log.cells.length - 1).toBe(Object.keys(input).length + 1); // + ลำดับ
    expect(log.cells[1]).toEqual(['11/11/2026 10:00:00', 'editor@x.com', 'CREATE', 6, 8, 'ลำดับ', '', '8']);
  });

  it('writes Date objects to date columns that hold dates, and text where the column holds text', () => {
    repo.create(input, 'editor@x.com');
    const last = main.cells[5];
    expect(last[col('วันที่ต้องได้') - 1]).toBeInstanceOf(Date);
    expect(last[col('วันที่ Deploy') - 1]).toBe('1/12/2026');
  });

  it('returns LOCK_TIMEOUT and writes nothing when the lock is busy', () => {
    lock.available = false;
    const before = main.cells.length;
    expect(repo.create(input, 'editor@x.com')).toMatchObject({ ok: false, code: 'LOCK_TIMEOUT' });
    expect(main.cells.length).toBe(before);
  });

  it('refuses when headers are missing', () => {
    main.cells[0][col('สถานะ') - 1] = 'Status';
    expect(repo.create(input, 'editor@x.com')).toMatchObject({ ok: false, code: 'SCHEMA' });
  });
});

describe('update (constitution V)', () => {
  const req = (o = {}) => ({
    rowNumber: 3,
    seq: 2,
    changes: { developer: { from: 'เอิร์น', to: 'กิ่ง' } },
    ...o,
  });

  it('writes only the changed cells and logs old/new values', () => {
    main.writes = [];
    const res = repo.update(req(), 'editor@x.com');
    expect(res).toEqual({ ok: true, data: { rowNumber: 3, seq: 2, written: ['developer'] } });
    // text is sent with a leading apostrophe so Sheets keeps it as typed (see repo.review.test.js)
    // plain text: no apostrophe for normal values, so dropdown chips keep their colours (2026-11-11)
    expect(main.writes).toEqual([{ row: 3, col: col('นักพัฒนา'), value: 'กิ่ง' }]);
    const log = ss.getSheetByName(Config.SHEETS.log);
    expect(log.cells[1]).toEqual([
      '11/11/2026 10:00:00',
      'editor@x.com',
      'UPDATE',
      3,
      2,
      'นักพัฒนา',
      'เอิร์น',
      'กิ่ง',
    ]);
  });

  it('stops with SEQ_MISMATCH when the row now holds another ลำดับ (sheet was sorted)', () => {
    main.writes = [];
    expect(repo.update(req({ seq: 1 }), 'editor@x.com')).toMatchObject({ ok: false, code: 'SEQ_MISMATCH' });
    expect(main.writes).toEqual([]);
  });

  it('stops with CONFLICT when a cell changed since the client loaded it', () => {
    main.cells[2][col('นักพัฒนา') - 1] = 'กิ่ง';
    main.writes = [];
    const res = repo.update(
      req({ changes: { developer: { from: 'เอิร์น', to: 'นุชนารถ (แก๊ส)' } } }),
      'x@x.com',
    );
    expect(res).toMatchObject({
      ok: false,
      code: 'CONFLICT',
      details: { developer: { expected: 'เอิร์น', actual: 'กิ่ง' } },
    });
    expect(main.writes).toEqual([]);
  });

  it('stops with SEQ_INVALID for duplicate ลำดับ', () => {
    main.appendRow(row(2));
    expect(repo.update(req(), 'editor@x.com')).toMatchObject({ ok: false, code: 'SEQ_INVALID' });
  });

  it('stops with NOT_FOUND outside the data range', () => {
    expect(repo.update(req({ rowNumber: 99 }), 'editor@x.com')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
    expect(repo.update(req({ rowNumber: 1 }), 'editor@x.com')).toMatchObject({
      ok: false,
      code: 'NOT_FOUND',
    });
  });

  it('keeps Date type when the existing cell holds a Date', () => {
    repo.update(req({ changes: { dueDate: { from: '16/4/2026', to: '20/4/2026' } } }), 'editor@x.com');
    const v = main.cells[2][col('วันที่ต้องได้') - 1];
    expect(v).toBeInstanceOf(Date);
    expect(v.getDate()).toBe(20);
  });

  it('writes numbers as numbers', () => {
    repo.update(req({ changes: { devQueue: { from: '3', to: '5' } } }), 'editor@x.com');
    expect(main.cells[2][col('ลำดับการแก้ไข Dev') - 1]).toBe(5);
  });

  it('returns LOCK_TIMEOUT without writing', () => {
    lock.available = false;
    main.writes = [];
    expect(repo.update(req(), 'editor@x.com')).toMatchObject({ ok: false, code: 'LOCK_TIMEOUT' });
    expect(main.writes).toEqual([]);
  });

  it('readRow returns the raw display values of one row', () => {
    expect(repo.readRow(3)).toMatchObject({ rowNumber: 3, seq: '2', devQueue: '3' });
    expect(repo.readRow(99)).toBeNull();
  });
});

describe('users (_app_users)', () => {
  it('returns null for unknown users and upserts mappings with a log entry', () => {
    expect(repo.getUserName('a@x.com')).toBeNull();
    expect(repo.setUserName('A@x.com', 'เอิร์น')).toEqual({ ok: true, data: { name: 'เอิร์น' } });
    expect(repo.getUserName('a@x.com')).toBe('เอิร์น');
    repo.setUserName('a@x.com', 'กิ่ง');
    expect(repo.getUserName('a@x.com')).toBe('กิ่ง');
    expect(ss.getSheetByName(Config.SHEETS.users).cells.length).toBe(2);
    const log = ss.getSheetByName(Config.SHEETS.log).cells;
    expect(log[log.length - 1].slice(2)).toEqual(['MAP_USER', '', '', 'ชื่อผู้ใช้', 'เอิร์น', 'กิ่ง']);
  });
});

describe('canEdit', () => {
  it('is true for editors and false for others or when the check fails', () => {
    expect(repo.canEdit('Editor@x.com')).toBe(true);
    expect(repo.canEdit('viewer@x.com')).toBe(false);
    ss.editors = 'throw';
    expect(repo.canEdit('editor@x.com')).toBe(false);
  });
});
