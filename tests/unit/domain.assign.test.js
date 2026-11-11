import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "เมนูสำหรับหัวหน้า dev ไปใส่ชื่อนักพัฒนาที่ยังไม่ระบุ" (user, 2026-11-11)
const D = loadDomain();
const today = d(2026, 11, 11);
const mk = (seq, o) =>
  D.enrich(
    { rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'รอทีมพัฒนา', urgency: 'ปกติ', ...o },
    today,
  );

describe('unassignedQueue', () => {
  const rows = [
    mk(1, { dueDate: '30/11/2026' }),
    mk(2, { dueDate: '1/11/2026' }), // overdue 10 days
    mk(3, { dueDate: '20/11/2026', urgency: 'ด่วนที่สุด' }),
    mk(4, {}), // no due date
    mk(5, { dueDate: '5/11/2026' }), // overdue 6 days
    mk(6, { developer: 'แดง', dueDate: '1/11/2026' }), // assigned → not in queue
    mk(7, { status: '0.แก้ไขเรียบร้อย', doneDate: '1/11/2026' }), // closed → not in queue
    mk(8, { status: '0.ยกเลิก' }),
  ];
  it('lists only open items with no developer', () => {
    expect(
      D.unassignedQueue(rows, today)
        .map((r) => r.id)
        .sort(),
    ).toEqual(['1', '2', '3', '4', '5']);
  });
  it('orders overdue first (most days), then urgency, then due date, then no due date', () => {
    expect(D.unassignedQueue(rows, today).map((r) => r.id)).toEqual(['2', '5', '3', '1', '4']);
  });
});
