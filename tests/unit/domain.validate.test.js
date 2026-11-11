import { describe, it, expect } from 'vitest';
import { loadDomain } from '../helpers.js';

const D = loadDomain();

const options = {
  platform: ['EHP', 'NHIP'],
  issueType: ['Requement', 'defect'],
  urgency: ['ด่วนที่สุด', 'ด่วน', 'ปกติ'],
  status: D.WORKFLOW.slice(),
  system: ['เวชระเบียน'],
  person: ['นุชนารถ (แก๊ส)', 'เอิร์น'],
};

const valid = {
  platform: 'EHP',
  issueType: 'Requement',
  urgency: 'ปกติ',
  status: '0.รอแจ้งทีมพัฒนา',
  system: 'เวชระเบียน',
  detail: 'ขอเพิ่มรายงาน',
  pm: 'นุชนารถ (แก๊ส)',
  dueDate: '30/11/2026',
};

describe('validateCreate (FR-015..FR-017)', () => {
  it('accepts a complete valid request', () => {
    expect(D.validateCreate(valid, options)).toEqual({ ok: true, errors: {}, warnings: {} });
  });

  it('requires all mandatory fields with Thai messages', () => {
    const res = D.validateCreate({}, options);
    expect(res.ok).toBe(false);
    expect(Object.keys(res.errors).sort()).toEqual(
      ['detail', 'dueDate', 'issueType', 'platform', 'pm', 'status', 'system', 'urgency'].sort(),
    );
    expect(res.errors.detail).toMatch(/กรุณา/);
  });

  it('rejects option values that are not exactly in the option set', () => {
    const res = D.validateCreate({ ...valid, platform: 'ehp' }, options);
    expect(res.errors.platform).toBeDefined();
  });

  it('allows a new ระบบงาน with a warning', () => {
    const res = D.validateCreate({ ...valid, system: 'ระบบใหม่' }, options);
    expect(res.ok).toBe(true);
    expect(res.warnings.system).toMatch(/ใหม่/);
  });

  it('rejects unknown optional developer', () => {
    expect(D.validateCreate({ ...valid, developer: 'คนนอก' }, options).errors.developer).toBeDefined();
  });

  it('rejects unparseable dates', () => {
    expect(D.validateCreate({ ...valid, dueDate: '2026-11-30' }, options).errors.dueDate).toBeDefined();
    expect(D.validateCreate({ ...valid, deployDate: 'พรุ่งนี้' }, options).errors.deployDate).toBeDefined();
  });

  it('requires วันที่เสร็จ when status is 0.แก้ไขเรียบร้อย', () => {
    const res = D.validateCreate({ ...valid, status: '0.แก้ไขเรียบร้อย' }, options);
    expect(res.errors.doneDate).toBeDefined();
    expect(
      D.validateCreate({ ...valid, status: '0.แก้ไขเรียบร้อย', doneDate: '1/11/2026' }, options).ok,
    ).toBe(true);
  });

  it('rejects non-numeric numbers', () => {
    expect(D.validateCreate({ ...valid, devHours: 'สองชั่วโมง' }, options).errors.devHours).toBeDefined();
    expect(D.validateCreate({ ...valid, devQueue: '3' }, options).ok).toBe(true);
  });

  it('rejects statuses outside the workflow', () => {
    expect(D.validateCreate({ ...valid, status: 'รอเทส' }, options).errors.status).toBeDefined();
  });
});

describe('validateUpdate (FR-019..FR-021)', () => {
  const current = { ...valid, seq: 10 };

  it('rejects empty change sets and ลำดับ changes', () => {
    expect(D.validateUpdate({}, current, options).ok).toBe(false);
    expect(D.validateUpdate({ seq: { from: '10', to: '11' } }, current, options).errors.seq).toBeDefined();
  });

  it('validates only changed keys', () => {
    const res = D.validateUpdate(
      { developer: { from: '', to: 'เอิร์น' } },
      { ...current, platform: 'ผิด' },
      options,
    );
    expect(res.ok).toBe(true);
  });

  it('forbids clearing a required field', () => {
    expect(D.validateUpdate({ detail: { from: 'x', to: '' } }, current, options).errors.detail).toBeDefined();
  });

  it('requires a done date when moving to 0.แก้ไขเรียบร้อย, using the change or the current value', () => {
    const toDone = { status: { from: 'กำลังพัฒนา', to: '0.แก้ไขเรียบร้อย' } };
    expect(D.validateUpdate(toDone, current, options).errors.doneDate).toBeDefined();
    expect(
      D.validateUpdate({ ...toDone, doneDate: { from: '', to: '11/11/2026' } }, current, options).ok,
    ).toBe(true);
    expect(D.validateUpdate(toDone, { ...current, doneDate: '10/11/2026' }, options).ok).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(D.validateUpdate({ foo: { from: '', to: 'x' } }, current, options).ok).toBe(false);
  });
});

describe('diffChanges', () => {
  it('returns only changed fields with from/to (trimmed compare)', () => {
    const before = { status: 'กำลังพัฒนา', developer: 'เอิร์น', detail: 'x' };
    const after = { status: 'รอ compile', developer: 'เอิร์น', detail: 'x ' };
    expect(D.diffChanges(before, after)).toEqual({ status: { from: 'กำลังพัฒนา', to: 'รอ compile' } });
  });
});

describe('nextSeq', () => {
  it('is max + 1, ignoring missing values', () => {
    expect(D.nextSeq([{ seq: 3 }, { seq: 10 }, { seq: null }])).toBe(11);
    expect(D.nextSeq([])).toBe(1);
  });
});
