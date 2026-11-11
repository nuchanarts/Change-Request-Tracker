import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();
const today = d(2026, 11, 11);

const options = {
  platform: ['EHP', 'NHIP', 'INV', 'EHP Pharmacy'],
  issueType: [
    'Requement',
    'defect',
    'ลด error',
    'การใช้งาน',
    'ข้อมูลพื้นฐาน',
    'รายงาน',
    'แบบฟอร์ม',
    'ไม่ระบุ',
  ],
  urgency: ['ด่วนที่สุด', 'ด่วน', 'ปกติ'],
  status: D.WORKFLOW.slice(),
  system: ['เวชระเบียน', 'Dispensary'],
  person: ['นุชนารถ (แก๊ส)', 'เอิร์น', 'กิ่ง'],
};

const base = {
  rowNumber: 5,
  seq: '12',
  platform: 'EHP',
  issueType: 'Requement',
  urgency: 'ปกติ',
  status: 'กำลังพัฒนา',
  system: 'เวชระเบียน',
  detail: 'แก้หน้าจอ',
  pm: 'นุชนารถ (แก๊ส)',
  ticket: '1457',
  dueDate: '20/11/2026',
  developer: 'เอิร์น',
};

describe('enrich', () => {
  it('normalizes strings, numbers and derived flags', () => {
    const r = D.enrich({ ...base, devQueue: '2', devHours: '4.5', detail: '  แก้หน้าจอ  ' }, today);
    expect(r.seq).toBe(12);
    expect(r.detail).toBe('แก้หน้าจอ');
    expect(r.devQueue).toBe(2);
    expect(r.devHours).toBe(4.5);
    expect(r.isOpen).toBe(true);
    expect(r.id).toBe('12');
  });

  it('uses row:<n> as id when ลำดับ is missing', () => {
    expect(D.enrich({ ...base, seq: '' }, today).id).toBe('row:5');
  });

  it('turns non-numeric numbers into null', () => {
    expect(D.enrich({ ...base, devQueue: 'abc' }, today).devQueue).toBeNull();
  });
});

describe('ticketUrl', () => {
  it('returns the URL when the value contains one', () => {
    expect(D.ticketUrl('ดูที่ https://taiga.example/project/x/us/1000 ครับ')).toBe(
      'https://taiga.example/project/x/us/1000',
    );
  });

  it('returns null for ticket numbers and empty values', () => {
    expect(D.ticketUrl('1457')).toBeNull();
    expect(D.ticketUrl('')).toBeNull();
  });
});

describe('detectIssues (FR-031)', () => {
  const codes = (row, seqCounts = { 12: 1 }) =>
    D.detectIssues(D.enrich(row, today), options, seqCounts).map((i) => `${i.code}:${i.column}`);

  it('returns no issues for a clean row', () => {
    expect(codes(base)).toEqual([]);
  });

  it('flags option values outside the option set, naming the column', () => {
    expect(codes({ ...base, platform: '16/4/2026', issueType: 'เอิร์น' })).toEqual([
      'OPTION_INVALID:platform',
      'OPTION_INVALID:issueType',
    ]);
  });

  it('does not flag an unknown ระบบงาน (free text allowed) nor empty optional people', () => {
    expect(codes({ ...base, system: 'ระบบใหม่', developer: '' })).toEqual([]);
  });

  it('flags an unknown PM, but not a typed-in developer name (developer is free text, user request 2026-11-11)', () => {
    expect(codes({ ...base, pm: 'ใครไม่รู้' })).toEqual(['OPTION_INVALID:pm']);
    expect(codes({ ...base, developer: 'นักพัฒนาใหม่' })).toEqual([]);
  });

  it('flags unparseable and Buddhist-era dates', () => {
    expect(codes({ ...base, dueDate: 'สิ้นเดือน' })).toContain('DATE_UNPARSEABLE:dueDate');
    expect(codes({ ...base, deployDate: '1/1/2569' })).toContain('DATE_BUDDHIST_YEAR:deployDate');
  });

  it('flags missing and duplicate ลำดับ', () => {
    expect(codes({ ...base, seq: '' }, {})).toContain('SEQ_MISSING:seq');
    expect(codes(base, { 12: 2 })).toContain('SEQ_DUPLICATE:seq');
  });

  it('flags open items without any due date', () => {
    expect(codes({ ...base, dueDate: '' })).toContain('OPEN_NO_DUE:dueDate');
  });

  it('flags done items without a done date', () => {
    expect(codes({ ...base, status: '0.แก้ไขเรียบร้อย', doneDate: '' })).toContain(
      'CLOSED_NO_DONE_DATE:doneDate',
    );
  });

  it('flags unknown statuses but not empty ones', () => {
    expect(codes({ ...base, status: 'รอเทส' })).toContain('STATUS_UNKNOWN:status');
    expect(codes({ ...base, status: '' })).not.toContain('STATUS_UNKNOWN:status');
  });

  it('each issue carries a Thai message', () => {
    const [issue] = D.detectIssues(D.enrich({ ...base, platform: 'x' }, today), options, { 12: 1 });
    expect(issue.message).toMatch(/แพลตฟอร์ม/);
  });
});

describe('countSeq', () => {
  it('counts ลำดับ occurrences', () => {
    const rows = [{ seq: 1 }, { seq: 2 }, { seq: 2 }, { seq: null }].map((r) => r);
    expect(D.countSeq(rows)).toEqual({ 1: 1, 2: 2 });
  });
});
