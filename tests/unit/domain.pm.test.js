import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "PM จะมีแค่ 4 คน" (user, 2026-11-11): the PM table always shows the four PMs; anything else is one bucket.
const D = loadDomain();
const today = d(2026, 11, 11);
const PMS = ['นุชนารถ (แก๊ส)', 'วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)', 'กษิดิ์เดช (พี่ป้อง)'];
const mk = (seq, o) =>
  D.enrich(
    { rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'กำลังพัฒนา', dueDate: '30/11/2026', ...o },
    today,
  );

describe('pmBreakdown', () => {
  const rows = [
    mk(1, { pm: 'วนิดา (แพท)' }),
    mk(2, { pm: 'วนิดา (แพท)', dueDate: '1/11/2026' }),
    mk(3, { pm: 'นุชนารถ (แก๊ส)' }),
    mk(4, { pm: 'คนเก่า' }),
    mk(5, { pm: '' }),
    mk(6, { pm: 'ทิพวรรณ (พี่ส้ม)', status: '0.แก้ไขเรียบร้อย' }), // closed → not counted
  ];
  const out = D.pmBreakdown(D.computeMetrics(rows, today).byPm, PMS);

  it('lists the four PMs in order, including those with no open work', () => {
    expect(out.slice(0, 4).map((p) => [p.name, p.open, p.overdue])).toEqual([
      ['นุชนารถ (แก๊ส)', 1, 0],
      ['วนิดา (แพท)', 2, 1],
      ['ทิพวรรณ (พี่ส้ม)', 0, 0],
      ['กษิดิ์เดช (พี่ป้อง)', 0, 0],
    ]);
  });

  it('puts other or empty PM values into one "อื่นๆ" row so totals still match', () => {
    expect(out[4]).toMatchObject({
      name: 'อื่นๆ (ไม่อยู่ในรายชื่อ PM)',
      other: true,
      open: 2,
      ids: ['4', '5'],
    });
    expect(out.reduce((n, p) => n + p.open, 0)).toBe(5);
  });

  it('omits the "อื่นๆ" row when every item has one of the four PMs', () => {
    const clean = D.pmBreakdown(D.computeMetrics([mk(1, { pm: 'วนิดา (แพท)' })], today).byPm, PMS);
    expect(clean).toHaveLength(4);
  });
});

describe('withoutRetired (แฮ่ม resigned, 2026-11-11)', () => {
  it('drops a retired person by exact name, nickname in brackets, or a whole word', () => {
    expect(D.withoutRetired(['แฮ่ม', 'สมชาย (แฮ่ม)', 'แฮ่ม ใจดี', 'แดง'], ['แฮ่ม'])).toEqual(['แดง']);
  });
  it('does not drop names that merely contain the letters', () => {
    expect(D.withoutRetired(['แฮ่มมี่'], ['แฮ่ม'])).toEqual(['แฮ่มมี่']);
  });
});

describe('statusLabel (hide "0." on screen, 2026-11-11)', () => {
  it('drops the leading 0. but keeps everything else', () => {
    expect(D.statusLabel('0.แก้ไขเรียบร้อย')).toBe('แก้ไขเรียบร้อย');
    expect(D.statusLabel('0.จัดทำ Taiga')).toBe('จัดทำ Taiga');
    expect(D.statusLabel('กำลังพัฒนา')).toBe('กำลังพัฒนา');
    expect(D.statusLabel('รอ compile')).toBe('รอ compile');
    expect(D.statusLabel('')).toBe('');
  });
  it('is display only: the workflow values stay exactly as spelled', () => {
    expect(D.WORKFLOW).toContain('0.แก้ไขเรียบร้อย');
    expect(D.DONE).toBe('0.แก้ไขเรียบร้อย');
  });
});
