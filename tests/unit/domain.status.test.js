import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();

describe('status semantics (constitution IV)', () => {
  it('treats exactly the three closed statuses as closed', () => {
    expect(D.isOpen('0.แก้ไขเรียบร้อย')).toBe(false);
    expect(D.isOpen('0.ยกเลิก')).toBe(false);
    expect(D.isOpen('0.ใช้งานได้อยู่แล้ว')).toBe(false);
  });

  it('never uses "starts with 0." — these are still open', () => {
    expect(D.isOpen('0.รอแจ้งทีมพัฒนา')).toBe(true);
    expect(D.isOpen('0.จัดทำไฟล์แก้ไข')).toBe(true);
  });

  it('treats empty status as open', () => {
    expect(D.isOpen('')).toBe(true);
    expect(D.isOpen(null)).toBe(true);
  });

  it('ignores surrounding whitespace when comparing', () => {
    expect(D.isOpen('  0.ยกเลิก ')).toBe(false);
  });

  it('exposes the workflow in the PM-approved order (2026-11-11), spellings kept exactly', () => {
    expect(D.WORKFLOW).toEqual([
      '0.จัดทำไฟล์แก้ไข',
      '0.จัดทำ Taiga',
      'รอ PM ตรวจสอบ Taiga',
      '0.รอแจ้งทีมพัฒนา',
      'dev ขอ Sourecode อจ.',
      'รอทีมพัฒนา',
      'กำลังพัฒนา',
      'ส่งกลับนักพัฒนาแก้ไข',
      'กำลังทดสอบ',
      'รอ compile',
      'รอ Complie ต้องแจ้งอจ.',
      '0.ยกเลิก',
      '0.ใช้งานได้อยู่แล้ว',
      '0.แก้ไขเรียบร้อย',
    ]);
  });

  it('new statuses are open; new items still start at 0.รอแจ้งทีมพัฒนา', () => {
    expect(D.isOpen('0.จัดทำ Taiga')).toBe(true);
    expect(D.isOpen('dev ขอ Sourecode อจ.')).toBe(true);
    expect(D.DEFAULT_STATUS).toBe('0.รอแจ้งทีมพัฒนา');
  });

  it('statusRank puts unknown statuses after the workflow', () => {
    expect(D.statusRank('รอทีมพัฒนา')).toBe(5);
    expect(D.statusRank('อะไรก็ไม่รู้')).toBeGreaterThan(D.WORKFLOW.length - 1);
  });
});

describe('effective due date and overdue', () => {
  const today = d(2026, 11, 11);
  const row = (o) => D.enrich({ rowNumber: 2, seq: '1', detail: 'x', status: 'กำลังพัฒนา', ...o }, today);

  it('uses วันที่เลื่อน when it parses', () => {
    const r = row({ dueDate: '20/11/2026', postponedDate: '10/11/2026' });
    expect(r.effectiveDue).toEqual(d(2026, 11, 10));
    expect(r.isOverdue).toBe(true);
    expect(r.overdueDays).toBe(1);
  });

  it('falls back to วันที่ต้องได้ when วันที่เลื่อน is empty or unparseable', () => {
    expect(row({ dueDate: '1/11/2026', postponedDate: '' }).effectiveDue).toEqual(d(2026, 11, 1));
    expect(row({ dueDate: '1/11/2026', postponedDate: 'ไม่แน่ใจ' }).effectiveDue).toEqual(d(2026, 11, 1));
  });

  it('is not overdue on the due date itself', () => {
    expect(row({ dueDate: '11/11/2026' }).isOverdue).toBe(false);
  });

  it('closed items are never overdue', () => {
    expect(row({ dueDate: '1/1/2026', status: '0.แก้ไขเรียบร้อย' }).isOverdue).toBe(false);
  });

  it('items without a due date are not overdue', () => {
    const r = row({ dueDate: '' });
    expect(r.effectiveDue).toBeNull();
    expect(r.isOverdue).toBe(false);
    expect(r.overdueDays).toBe(0);
  });
});
