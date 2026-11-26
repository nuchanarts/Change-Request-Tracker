// "สรุปรายงานประจำวัน" (2026-11-26): _app_log entries and the bot's Taiga events for a date range. Reads only.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const d = (y, m, dd) => ({ y, m, d: dd });
const TAIGA_HEAD = ['เวลา', 'ชนิด', 'จาก', 'เป็น', 'โดย', 'ลิงก์'];
const at = (day, h) => new Date(Date.UTC(2026, 10, day, h - 7, 0)); // Bangkok hour

const build = ({ taiga = true } = {}) => {
  const sheets = [
    new FakeSheet(Config.SHEETS.main, [Domain.COLUMNS.map((c) => c.header)]),
    new FakeSheet(Config.SHEETS.log, [
      Config.LOG_HEADERS.slice(),
      ['22/11/2026 23:59:00', 'a@x.com', 'UPDATE', 2, 1, 'สถานะ', 'x', 'y'], // the Sunday before
      ['23/11/2026 09:00:00', 'a@x.com', 'UPDATE', 2, 1, 'สถานะ', 'กำลังพัฒนา', 'กำลังทดสอบ'],
      ['24/11/2026 10:00:00', 'a@x.com', 'DELETE', 3, 2, '(ทั้งแถว)', '{"big":"json"}', ''],
      ['24/11/2026 11:00:00', 'admin@x.com', 'TAIGA_MAP', '', '', 'Ready', '', 'รอทีมพัฒนา'], // no ลำดับ
      ['27/11/2026 08:00:00', 'a@x.com', 'UPDATE', 2, 1, 'สถานะ', 'a', 'b'], // after the range
    ]),
  ];
  if (taiga)
    sheets.push(
      new FakeSheet('_แมวส้ม_Taiga', [
        TAIGA_HEAD,
        [at(22, 23), 'สถานะ', 'New', 'Ready', 'ริว', 'https://taiga.hosxp.net/project/p/us/1'],
        [at(25, 1), 'สถานะ', 'Ready', 'In progress', 'ริว', 'https://taiga.hosxp.net/project/p/us/1'],
      ]),
    );
  return makeRepo({
    ss: new FakeSpreadsheet(sheets),
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    nowText: () => '26/11/2026 10:00:00',
    makeDate: () => null,
  });
};

describe('activity', () => {
  it('returns the log entries with a ลำดับ and the Taiga events inside the range', () => {
    const a = build().activity(d(2026, 11, 23), d(2026, 11, 26));
    expect(a.log.map((e) => [e.time, e.action, e.seq])).toEqual([
      ['23/11/2026 09:00:00', 'UPDATE', 1],
      ['24/11/2026 10:00:00', 'DELETE', 2],
    ]);
    expect(a.log[1].from).toBe(''); // the deleted row's JSON snapshot stays in the sheet
    expect(a.taiga.map((e) => [e.to, e.by])).toEqual([['In progress', 'ริว']]);
  });

  it('works without the bot’s Taiga log', () => {
    expect(build({ taiga: false }).activity(d(2026, 11, 23), d(2026, 11, 26)).taiga).toEqual([]);
  });
});
