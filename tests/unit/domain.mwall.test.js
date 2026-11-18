import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "งานของฉัน — งานที่คุณเป็นนักพัฒนา อยากให้ดูได้แบบทุกคนด้วย" (user, 2026-11-18):
// one "ทุกคน" choice shows every developer's work (items with a developer; unassigned ones live in มอบหมายงาน).
const D = loadDomain();
const today = d(2026, 11, 18); // Wednesday; this week = 16–22 Nov
const mk = (seq, developer, o = {}) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      detail: 'x',
      status: 'กำลังพัฒนา',
      dueDate: '19/11/2026',
      developer,
      ...o,
    },
    today,
  );
const rows = [
  mk(1, 'เอิร์น'),
  mk(2, 'กิ่ง'),
  mk(3, ''),
  mk(4, 'กิ่ง', { status: '0.แก้ไขเรียบร้อย', doneDate: '17/11/2026' }),
];

describe('My Work: all developers', () => {
  it('has a fixed label', () => {
    expect(D.ALL_DEVELOPERS).toBe('ทุกคน');
  });

  it('groupMyWeek with ทุกคน counts every assigned item, not unassigned ones', () => {
    const g = D.groupMyWeek(rows, D.ALL_DEVELOPERS, 'developer', today);
    expect(g.openTotal).toBe(2);
    expect(g.thisWeek.map((r) => r.seq)).toEqual([1, 2]);
    expect(g.doneThisWeek.map((r) => r.seq)).toEqual([4]);
  });

  it('a single developer still sees only their own work', () => {
    expect(D.groupMyWeek(rows, 'กิ่ง', 'developer', today).openTotal).toBe(1);
  });

  it('weekPlan with ทุกคน puts every assigned open item on its day', () => {
    const p = D.weekPlan(rows, D.ALL_DEVELOPERS, today, 0);
    expect(p.total).toBe(2);
    expect(p.days[3].items.map((r) => r.seq)).toEqual([1, 2]); // Thu 19 Nov
  });

  it('ทุกคน is not special for the PM role', () => {
    const pmRows = [mk(5, 'เอิร์น', { pm: 'นุชนารถ (แก๊ส)' })];
    expect(D.groupMyWeek(pmRows, D.ALL_DEVELOPERS, 'pm', today).openTotal).toBe(0);
  });
});
