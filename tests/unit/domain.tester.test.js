import { describe, it, expect } from 'vitest';
import { loadDomain } from '../helpers.js';

// ผู้ทดสอบ column (user request 2026-11-18): optional, pick from the list or type a new name.
const D = loadDomain();
const options = {
  person: ['นุชนารถ (แก๊ส)', 'เอิร์น'],
  developer: ['เอิร์น', 'กิ่ง'],
  tester: ['กิ่ง', 'บี'],
};

describe('tester column', () => {
  it('is in the data contract as an optional free person column', () => {
    expect(D.COLUMN_BY_KEY.tester).toMatchObject({
      key: 'tester',
      header: 'ผู้ทดสอบ',
      type: 'freePerson',
      optional: true,
    });
    expect(D.COLUMN_BY_KEY.tester.required).toBeFalsy();
  });

  it('accepts a tester from the list without warning', () => {
    const v = D.validateUpdate({ tester: { from: '', to: 'บี' } }, {}, options);
    expect(v).toEqual({ ok: true, errors: {}, warnings: {} });
  });

  it('accepts a new tester name with a tester-specific warning', () => {
    const v = D.validateUpdate({ tester: { from: '', to: 'คนใหม่' } }, {}, options);
    expect(v.ok).toBe(true);
    expect(v.warnings.tester).toBe('เป็นชื่อผู้ทดสอบใหม่ที่ยังไม่มีในรายการ');
  });

  it('keeps the developer warning text unchanged', () => {
    const v = D.validateUpdate({ developer: { from: '', to: 'คนใหม่' } }, {}, options);
    expect(v.warnings.developer).toBe('เป็นชื่อนักพัฒนาใหม่ที่ยังไม่มีในรายการ');
  });

  it('allows an empty tester', () => {
    expect(D.validateUpdate({ tester: { from: 'บี', to: '' } }, {}, options).ok).toBe(true);
  });
});
