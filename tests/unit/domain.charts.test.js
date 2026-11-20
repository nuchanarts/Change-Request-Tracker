import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// Monitor charts (user request 2026-11-20: "มีกราฟฟิก ให้ดูน่าใช้งาน").
const D = loadDomain();
const today = d(2026, 11, 20);
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      platform: 'EHP',
      detail: 'x',
      status: 'กำลังพัฒนา',
      dueDate: '30/11/2026',
      ...o,
    },
    today,
  );

describe('closedByMonth', () => {
  const rows = [
    mk(1, { status: '0.แก้ไขเรียบร้อย', doneDate: '3/11/2026' }),
    mk(2, { status: '0.แก้ไขเรียบร้อย', doneDate: '30/11/2026' }),
    mk(3, { status: '0.ใช้งานได้อยู่แล้ว', doneDate: '15/10/2026' }),
    mk(4, { status: '0.แก้ไขเรียบร้อย', doneDate: '1/6/2026' }), // month 6 of 6 back
    mk(5, { status: '0.แก้ไขเรียบร้อย', doneDate: '31/5/2026' }), // too old
    mk(6, { status: '0.ยกเลิก', doneDate: '5/11/2026' }), // cancelled is not "done work"
    mk(7, { status: 'กำลังพัฒนา', doneDate: '5/11/2026' }), // open
    mk(8, { status: '0.แก้ไขเรียบร้อย', doneDate: '' }),
  ];
  it('counts closed (not cancelled) items per month, oldest first, ending this month', () => {
    const m = D.closedByMonth(rows, today, 6);
    expect(m.map((x) => [x.y, x.m, x.count])).toEqual([
      [2026, 6, 1],
      [2026, 7, 0],
      [2026, 8, 0],
      [2026, 9, 0],
      [2026, 10, 1],
      [2026, 11, 2],
    ]);
    expect(m[5].ids).toEqual(['1', '2']);
    expect(m[5].label).toBe('พ.ย.');
  });
  it('crosses the year boundary', () => {
    const m = D.closedByMonth([], d(2026, 2, 1), 3);
    expect(m.map((x) => [x.y, x.m])).toEqual([
      [2025, 12],
      [2026, 1],
      [2026, 2],
    ]);
  });
});

describe('openByPlatform', () => {
  it('open and overdue per platform, biggest first; closed items ignored', () => {
    const rows = [
      mk(1, { platform: 'EHP' }),
      mk(2, { platform: 'EHP', dueDate: '1/11/2026' }), // overdue
      mk(3, { platform: 'NHIP' }),
      mk(4, { platform: 'INV', dueDate: '1/11/2026' }),
      mk(5, { platform: 'INV' }),
      mk(6, { platform: 'INV', status: '0.แก้ไขเรียบร้อย' }),
      mk(7, { platform: '' }),
    ];
    expect(D.openByPlatform(rows).map((p) => [p.platform, p.open, p.overdue])).toEqual([
      ['EHP', 2, 1],
      ['INV', 2, 1],
      ['NHIP', 1, 0],
      ['ไม่ระบุแพลตฟอร์ม', 1, 0],
    ]);
    expect(D.openByPlatform(rows)[0].overdueIds).toEqual(['2']);
  });
});
