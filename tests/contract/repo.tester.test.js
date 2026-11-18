import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');

// ผู้ทดสอบ (user request 2026-11-18): read/written when the sheet has the column; a sheet without it still works.
const BASE = [
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

function setup(withTester) {
  const headers = withTester ? [...BASE, 'ผู้ทดสอบ'] : BASE.slice();
  const line = (seq, tester) => {
    const r = new Array(headers.length).fill('');
    const set = (h, v) => (r[headers.indexOf(h)] = v);
    set('ลำดับ', seq);
    set('แพลตฟอร์ม', 'EHP');
    set('ประเภทปัญหา', 'Requement');
    set('ความเร่งด่วน', 'ปกติ');
    set('สถานะ', 'กำลังทดสอบ');
    set('ระบบงาน', 'เวชระเบียน');
    set('รายละเอียด', 'งาน ' + seq);
    set('PM รับผิดชอบ', 'นุชนารถ (แก๊ส)');
    set('วันที่ต้องได้', '16/4/2026');
    set('นักพัฒนา', 'เอิร์น');
    if (withTester) set('ผู้ทดสอบ', tester);
    return r;
  };
  const main = new FakeSheet(Config.SHEETS.main, [headers, line(1, 'กิ่ง'), line(2, '')]);
  const people = new FakeSheet(Config.SHEETS.people, [
    ['ชื่อ', 'ตำแหน่ง'],
    ['เอิร์น', 'Dev'],
    ['กิ่ง', 'Tester'],
  ]);
  const ss = new FakeSpreadsheet([main, people], { editors: ['editor@x.com'] });
  const repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    nowText: () => '18/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
  return { main, repo, headers, ss };
}

describe('ผู้ทดสอบ column', () => {
  it('reads tester when the column exists', () => {
    const { repo } = setup(true);
    const res = repo.readAll();
    expect(res.missing).toEqual([]);
    expect(res.absent).toEqual([]);
    expect(res.rows.map((r) => r.tester)).toEqual(['กิ่ง', '']);
  });

  it('a sheet without the column is not a schema error; tester is reported absent', () => {
    const { repo } = setup(false);
    const res = repo.readAll();
    expect(res.missing).toEqual([]);
    expect(res.absent).toEqual(['tester']);
    expect(res.rows[0].tester).toBeUndefined();
  });

  it('update writes only the tester cell and logs it', () => {
    const { repo, main, headers, ss } = setup(true);
    const res = repo.update(
      { rowNumber: 3, seq: 2, changes: { tester: { from: '', to: 'กิ่ง' } } },
      'editor@x.com',
    );
    expect(res.ok).toBe(true);
    expect(main.cells[2][headers.indexOf('ผู้ทดสอบ')]).toBe('กิ่ง');
    const log = ss.getSheetByName(Config.SHEETS.log).cells;
    expect(log[log.length - 1]).toEqual(expect.arrayContaining(['ผู้ทดสอบ', '', 'กิ่ง']));
  });

  it('update of tester on a sheet without the column is rejected', () => {
    const { repo } = setup(false);
    const res = repo.update(
      { rowNumber: 2, seq: 1, changes: { tester: { from: '', to: 'กิ่ง' } } },
      'editor@x.com',
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('VALIDATION');
  });

  it('create writes tester when the column exists', () => {
    const { repo, main, headers } = setup(true);
    const res = repo.create(
      {
        platform: 'EHP',
        issueType: 'Requement',
        urgency: 'ปกติ',
        status: '0.รอแจ้งทีมพัฒนา',
        system: 'เวชระเบียน',
        detail: 'ใหม่',
        pm: 'นุชนารถ (แก๊ส)',
        dueDate: '30/11/2026',
        tester: 'กิ่ง',
      },
      'editor@x.com',
    );
    expect(res.ok).toBe(true);
    expect(main.cells[main.cells.length - 1][headers.indexOf('ผู้ทดสอบ')]).toBe('กิ่ง');
  });

  it('create on a sheet without the column ignores tester and keeps the row width', () => {
    const { repo, main, headers } = setup(false);
    const res = repo.create(
      {
        platform: 'EHP',
        issueType: 'Requement',
        urgency: 'ปกติ',
        status: '0.รอแจ้งทีมพัฒนา',
        system: 'เวชระเบียน',
        detail: 'ใหม่',
        pm: 'นุชนารถ (แก๊ส)',
        dueDate: '30/11/2026',
        tester: 'กิ่ง',
      },
      'editor@x.com',
    );
    expect(res.ok).toBe(true);
    const last = main.cells[main.cells.length - 1];
    expect(last.length).toBe(headers.length);
    expect(last).not.toContain('กิ่ง');
  });

  it('options.tester offers the same people as developer', () => {
    const { repo } = setup(true);
    const o = repo.options();
    expect(o.tester).toEqual(o.developer);
  });
});
