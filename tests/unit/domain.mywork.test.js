import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();
const today = d(2026, 11, 11);
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      detail: 'x',
      status: 'กำลังพัฒนา',
      pm: 'PM-A',
      developer: 'Dev-1',
      ...o,
    },
    today,
  );

const rows = [
  mk(1, { dueDate: '1/11/2026' }), // overdue
  mk(2, { dueDate: '11/11/2026', devQueue: '2' }), // today
  mk(3, { dueDate: '11/11/2026', devQueue: '1' }), // today, earlier queue
  mk(4, { dueDate: '18/11/2026' }), // within 7 days (exactly 7)
  mk(5, { dueDate: '19/11/2026' }), // later
  mk(6, { dueDate: '' }), // no due
  mk(7, { dueDate: '1/11/2026', status: '0.แก้ไขเรียบร้อย' }), // closed → excluded
  mk(8, { dueDate: '1/11/2026', developer: 'Dev-2' }), // someone else
];

describe('groupMyWork (FR-027)', () => {
  it('groups my open developer work into 5 buckets', () => {
    const g = D.groupMyWork(rows, 'Dev-1', 'developer', today);
    expect(g.overdue.map((r) => r.id)).toEqual(['1']);
    expect(g.today.map((r) => r.id)).toEqual(['3', '2']); // devQueue order
    expect(g.within7.map((r) => r.id)).toEqual(['4']);
    expect(g.later.map((r) => r.id)).toEqual(['5']);
    expect(g.noDue.map((r) => r.id)).toEqual(['6']);
    expect(g.total).toBe(6);
  });

  it('uses the PM column for the pm role', () => {
    const g = D.groupMyWork(rows, 'PM-A', 'pm', today);
    expect(g.total).toBe(7);
  });

  it('returns empty groups for an unknown name', () => {
    expect(D.groupMyWork(rows, '', 'developer', today).total).toBe(0);
  });
});

describe('nextStatus', () => {
  it('suggests the next workflow step for open statuses', () => {
    expect(D.nextStatus('กำลังพัฒนา')).toBe('0.จัดทำไฟล์แก้ไข');
    expect(D.nextStatus('รอ PM ตรวจสอบ Taiga')).toBe('0.แก้ไขเรียบร้อย');
    expect(D.nextStatus('')).toBe('0.รอแจ้งทีมพัฒนา');
    expect(D.nextStatus('0.ยกเลิก')).toBeNull();
  });
});
