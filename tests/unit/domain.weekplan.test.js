import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "งานพัฒนาของฉัน ... ให้รู้ว่าตัวเองต้องทำอะไรในแต่ละสัปดาห์ และอะไรที่เกินกำหนด" (user, 2026-11-11)
const D = loadDomain();
const today = d(2026, 11, 11); // Wednesday
const mk = (seq, o) =>
  D.enrich(
    { rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'กำลังพัฒนา', developer: 'แดง', ...o },
    today,
  );

const rows = [
  mk(1, { dueDate: '9/11/2026' }), // Monday this week, already late
  mk(2, { dueDate: '12/11/2026' }), // Thursday
  mk(3, { dueDate: '1/11/2026', postponedDate: '13/11/2026' }), // postponed → Friday
  mk(4, { dueDate: '12/11/2026', developer: 'ดำ' }), // someone else
  mk(5, { dueDate: '12/11/2026', status: '0.แก้ไขเรียบร้อย', doneDate: '10/11/2026' }), // closed
  mk(6, { dueDate: '17/11/2026' }), // next Tuesday
  mk(7, { dueDate: '15/11/2026' }), // Sunday
];

describe('weekPlan', () => {
  it('this week: Monday–Sunday, open items of that developer by due day (postponed date wins)', () => {
    const p = D.weekPlan(rows, 'แดง', today, 0);
    expect(p.range).toEqual({ from: d(2026, 11, 9), to: d(2026, 11, 15) });
    expect(p.isThisWeek).toBe(true);
    expect(p.days.map((x) => x.items.map((r) => r.id))).toEqual([['1'], [], [], ['2'], ['3'], [], ['7']]);
    expect(p.days[2].isToday).toBe(true);
    expect(p.days[0].isPast).toBe(true);
    expect(p.total).toBe(4);
  });
  it('offset moves by whole weeks', () => {
    const p = D.weekPlan(rows, 'แดง', today, 1);
    expect(p.range.from).toEqual(d(2026, 11, 16));
    expect(p.isThisWeek).toBe(false);
    expect(p.days[1].items.map((r) => r.id)).toEqual(['6']);
    expect(p.total).toBe(1);
  });
  it('no name → empty plan', () => {
    expect(D.weekPlan(rows, '', today, 0).total).toBe(0);
  });
});
