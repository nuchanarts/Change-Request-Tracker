import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// Text summary export (user request 2026-11-11), modelled on the team's monthly report.
const D = loadDomain();
const today = d(2026, 11, 11); // week 9–15 Nov 2026
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      platform: 'EHP',
      detail: 'งาน ' + seq,
      status: 'กำลังพัฒนา',
      developer: 'Dev-1',
      pm: 'PM-A',
      ticket: String(2000 + seq),
      dueDate: '30/11/2026',
      ...o,
    },
    today,
  );

const rows = [
  mk(1, { status: '0.แก้ไขเรียบร้อย', doneDate: '5/11/2026' }),
  mk(2, { status: '0.ยกเลิก' }),
  mk(3, { status: '0.ใช้งานได้อยู่แล้ว', doneDate: '1/10/2026' }),
  mk(4, { dueDate: '1/11/2026' }), // overdue 10
  mk(5, { dueDate: '9/11/2026', developer: 'Dev-2' }), // overdue 2
  mk(6, { dueDate: '13/11/2026' }), // this week
  mk(7, { dueDate: '14/11/2026', ticket: 'https://taiga.example/project/x/us/2252' }), // this week, URL ticket
  mk(8, { platform: 'INV', detail: 'ขอแก้ไขหน้าจอรายการสินค้าในคลัง', ticket: '' }), // new
  mk(9, { platform: 'NHIP', detail: 'ขอเพิ่มรายงานข้อมูลผู้รับบริการ' }), // new
];

describe('itemRef', () => {
  it('uses the ticket number when there is one, otherwise ลำดับ', () => {
    expect(D.itemRef(rows[3])).toBe('2004');
    expect(D.itemRef(rows[6])).toBe('2252'); // number from a Taiga URL
    expect(D.itemRef(rows[7])).toBe('ลำดับ 8');
  });
});

describe('buildReport', () => {
  const text = D.buildReport(rows, today, { sinceSeq: 7 });

  it('has the title for the month and the data date in Thai (B.E.)', () => {
    expect(text).toContain('สรุปรายการขอแก้ไขโปรแกรม ประจำเดือนพฤศจิกายน 2569');
    expect(text).toContain('ข้อมูล ณ วันที่ 11 พ.ย. 2569');
  });

  it('section 1: totals, closed by kind, remaining, new since the last report', () => {
    expect(text).toContain('รายการขอแก้ไขทั้งหมด 9 ข้อ (เพิ่มมาใหม่ 2 ข้อ)');
    expect(text).toContain('ดำเนินการแล้ว (ปิดงาน) 3 ข้อ: แก้ไขเรียบร้อย 1, ใช้งานได้อยู่แล้ว 1, ยกเลิก 1');
    expect(text).toContain('คงเหลือรอแก้ไข 6 ข้อ');
    expect(text).toContain('ปิดงานในเดือนนี้ 1 ข้อ');
  });

  it('section 2: queue due this week', () => {
    expect(text).toContain('2. รายการในคิวแก้ไขสัปดาห์นี้ (9–15 พ.ย. 2569)\nจำนวน 2 ข้อ ได้แก่ 2006, 2252');
  });

  it('section 3: overdue, longest first, with details', () => {
    expect(text).toContain('3. รายการเกินกำหนดระยะเวลา\nจำนวน 2 ข้อ ได้แก่ 2004, 2005');
    expect(text).toContain('- 2004 เกิน 10 วัน: งาน 4 (Dev-1)');
  });

  it('section 4: new items since the last report as "platform - detail"', () => {
    expect(text).toContain('4. รายการขอแก้ไขใหม่ จำนวน 2 ข้อ (ตั้งแต่ลำดับ 8)');
    expect(text).toContain('INV - ขอแก้ไขหน้าจอรายการสินค้าในคลัง');
    expect(text).toContain('NHIP - ขอเพิ่มรายงานข้อมูลผู้รับบริการ');
  });

  it('sections 5–6: open work by status and by developer', () => {
    expect(text).toContain('5. งานค้างแยกตามสถานะ');
    expect(text).toContain('- กำลังพัฒนา: 6');
    expect(text).toContain('6. งานค้างแยกตามนักพัฒนา');
    expect(text).toContain('- Dev-1: 5 (เกินกำหนด 1)');
  });

  it('without a baseline, section 4 says how to set it', () => {
    expect(D.buildReport(rows, today, {})).toContain('ระบุลำดับสุดท้ายของรายงานครั้งก่อน');
  });
});

describe('buildReport per PM', () => {
  it('names the PM in the header when the report is for one PM', () => {
    const text = D.buildReport(rows, today, { sinceSeq: 7, pm: 'PM-A' });
    expect(text).toContain('PM ผู้รับผิดชอบ: PM-A');
  });
});
