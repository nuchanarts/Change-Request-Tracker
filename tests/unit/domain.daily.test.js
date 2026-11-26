import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "สรุปรายงานประจำวัน" on หน้าหลัก (user request 2026-11-26): what changed today in the sheet (via _app_log)
// and in Taiga (the bot's log), plus what was fixed so far this week.
const D = loadDomain();
const today = d(2026, 11, 26); // Thursday; the week is 23–29 Nov
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      platform: 'INV',
      system: 'Inventory',
      detail: 'งาน ' + seq,
      status: 'กำลังพัฒนา',
      dueDate: '30/12/2026',
      ...o,
    },
    today,
  );
const T = (n) => 'https://taiga.hosxp.net/project/p/us/' + n;
const rows = [
  mk(688, { detail: '2312 NHIP_EHP-ขอแก้ไข\nการแสดงผล Stock Card', ticketLinks: [T(2312)] }),
  mk(689, { status: '0.แก้ไขเรียบร้อย', doneDate: '24/11/2026' }),
  mk(690, { status: '0.รอแจ้งทีมพัฒนา' }),
  mk(691, { status: '0.แก้ไขเรียบร้อย', doneDate: '20/11/2026' }), // last week
];
const ST = D.COLUMN_BY_KEY.status.header;
const log = [
  {
    time: '24/11/2026 14:00:00',
    who: 'แก้ส',
    action: 'UPDATE',
    seq: 689,
    column: ST,
    from: 'กำลังทดสอบ',
    to: '0.แก้ไขเรียบร้อย',
  },
  {
    time: '26/11/2026 09:15:00',
    who: 'แก้ส',
    action: 'UPDATE',
    seq: 688,
    column: ST,
    from: 'รอทีมพัฒนา',
    to: 'กำลังพัฒนา',
  },
  {
    time: '26/11/2026 09:16:00',
    who: 'แก้ส',
    action: 'TAIGA_PUSH',
    seq: 688,
    column: 'สถานะใน Taiga',
    from: 'Ready for DEV',
    to: 'In progress',
  },
  {
    time: '26/11/2026 11:00:00',
    who: 'แก้ส',
    action: 'CREATE',
    seq: 690,
    column: 'ลำดับ',
    from: '',
    to: '690',
  },
  {
    time: '26/11/2026 11:00:00',
    who: 'แก้ส',
    action: 'CREATE',
    seq: 690,
    column: 'รายละเอียด',
    from: '',
    to: 'งาน 690',
  },
  { time: '27/11/2026 08:00:00', who: 'แก้ส', action: 'UPDATE', seq: 690, column: ST, from: 'a', to: 'b' }, // after the day
];
// 26 Nov 10:05 Bangkok = 03:05 UTC
const at = (day, h, m) => Date.UTC(2026, 10, day, h - 7, m);
const taiga = [
  { kind: 'สถานะ', link: T(2312), from: 'In progress', to: 'Ready for test', by: 'ริว', at: at(26, 10, 5) },
  { kind: 'คอมเมนต์', link: T(2312), from: '', to: 'Ready for test', by: 'ริว', at: at(26, 10, 30) },
  { kind: 'สถานะ', link: T(9999), from: 'New', to: 'Ready', by: 'ต้น', at: at(26, 13, 0) }, // not in the sheet
  { kind: 'ทดสอบ', link: T(2312), from: '', to: '', by: 'bot', at: at(26, 13, 0) }, // the bot's own test
  { kind: 'สถานะ', link: T(2312), from: 'New', to: 'Ready for DEV', by: 'ริว', at: at(25, 23, 30) }, // 25 Nov Bangkok
];
const rep = () => D.dailyReport({ date: today, rows, log, taiga });

describe('logTime / bangkokTime', () => {
  it('reads the _app_log time and a Taiga time in Bangkok', () => {
    expect(D.logTime('26/11/2026 09:05:00')).toEqual({ date: d(2026, 11, 26), hm: '09:05' });
    expect(D.logTime('junk')).toBe(null);
    expect(D.bangkokTime(at(25, 23, 30))).toEqual({ date: d(2026, 11, 25), hm: '23:30' });
    expect(D.bangkokTime(null)).toBe(null);
  });
});

describe('dailyReport', () => {
  it('lists the day’s items with sheet and Taiga changes, oldest first', () => {
    const r = rep();
    expect(r.day.items.map((x) => x.seq)).toEqual([688, 690]);
    const a = r.day.items[0];
    expect(a.lines.map((l) => l.source + ' ' + l.hm)).toEqual([
      'sheet 09:15',
      'sheet 09:16',
      'taiga 10:05',
      'taiga 10:30',
    ]);
    expect(a.lines[0].text).toBe('สถานะ: รอทีมพัฒนา → กำลังพัฒนา');
    expect(a.lines[1].text).toBe('ส่งสถานะไป Taiga: Ready for DEV → In progress');
    expect(a.lines[2].text).toBe('Taiga: In progress → Ready for test');
    expect(a.lines[3].text).toBe('Taiga: มีคอมเมนต์ใหม่');
    // CREATE is one line, not one per cell
    expect(r.day.items[1].lines.map((l) => l.text)).toEqual(['เพิ่มรายการใหม่']);
    // a Taiga item the sheet does not know is left out (user request 2026-11-26)
  });

  it('counts the day', () => {
    expect(rep().day.counts).toEqual({
      items: 2,
      sheet: 2,
      taiga: 1,
      created: 1,
      moved: 1,
      closed: 0,
      pushed: 1,
    });
  });

  it('this week so far: every item with a change, and what was closed', () => {
    const w = rep().week;
    expect(w.range).toEqual({ from: d(2026, 11, 23), to: today });
    expect(w.items.map((x) => x.seq)).toEqual([688, 689, 690]);
    expect(w.closed.map((r) => r.seq)).toEqual([689]); // 691 closed last week
    expect(w.created).toBe(1);
  });

  it('an empty day still has the week', () => {
    const r = D.dailyReport({ date: d(2026, 11, 29), rows, log, taiga });
    expect(r.day.items).toEqual([]);
    expect(r.week.closed.map((x) => x.seq)).toEqual([689]);
  });
});

describe('dailyReportText', () => {
  it('follows the team format', () => {
    const text = D.dailyReportText(rep(), { reporter: 'นุชนาถ', today });
    expect(text).toContain('วันที่ปฏิบัติงาน : วันพฤหัสบดีที่ 26 พฤศจิกายน 2569');
    expect(text).toContain('ผู้รายงาน : นุชนาถ');
    expect(text).toContain('สรุปการดำเนินการ :');
    expect(text).toContain('รายละเอียดการดำเนินการ :');
    expect(text).toContain('1. #688 [INV] 2312 NHIP_EHP-ขอแก้ไข การแสดงผล Stock Card'); // one line
    expect(text).toContain('   - 09:15 สถานะ: รอทีมพัฒนา → กำลังพัฒนา (ชีต · แก้ส)');
    expect(text).toContain('   - 10:05 Taiga: In progress → Ready for test (Taiga · ริว)');
    expect(text).toContain('   🔗 ' + T(2312));
    expect(text).not.toContain('ไม่พบในชีต');
    expect(text).not.toContain('9999');
    expect(text).toContain('สรุปสิ่งที่แก้ไขในสัปดาห์นี้ (สะสม 23–26 พ.ย. 2569) :');
    expect(text).toContain('#689');
    expect(text.indexOf('วันที่ปฏิบัติงาน')).toBeLessThan(text.indexOf('สรุปการดำเนินการ'));
    expect(text.indexOf('รายละเอียดการดำเนินการ')).toBeLessThan(text.indexOf('สรุปสิ่งที่แก้ไขในสัปดาห์นี้'));
  });

  it('says so when nothing changed', () => {
    const text = D.dailyReportText(D.dailyReport({ date: d(2026, 11, 29), rows, log, taiga }), { today });
    expect(text).toContain('ไม่มีการเปลี่ยนแปลงในชีตหรือ Taiga');
  });
});
