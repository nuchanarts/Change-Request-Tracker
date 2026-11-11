import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();
const today = d(2026, 11, 11);
const rows = [
  { seq: '1', detail: 'แก้รายงานผู้ป่วยนอก', system: 'เวชระเบียน', ticket: '1457' },
  { seq: '25', detail: 'เพิ่มปุ่มพิมพ์', system: 'Dispensary', ticket: 'https://taiga/x/us/1000' },
  { seq: '300', detail: 'ปรับหน้าจอ', system: 'รายงาน สกส.', ticket: '' },
].map((r, i) => D.enrich({ rowNumber: i + 2, status: 'กำลังพัฒนา', ...r }, today));

describe('search (FR-029)', () => {
  const ids = (q) => D.search(rows, q).map((r) => r.id);

  it('requires at least 2 characters, otherwise returns all rows', () => {
    expect(ids('ร')).toEqual(['1', '25', '300']);
    expect(ids('')).toEqual(['1', '25', '300']);
  });

  it('matches detail and system (case-insensitive)', () => {
    expect(ids('รายงาน')).toEqual(['1', '300']);
    expect(ids('dispensary')).toEqual(['25']);
  });

  it('matches ลำดับ exactly and ticket text', () => {
    expect(ids('25')).toEqual(['25']);
    expect(ids('1457')).toEqual(['1']);
    expect(ids('us/1000')).toEqual(['25']);
  });
});
