import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// My Work by week + overdue age buckets (user requests 2026-11-11).
const D = loadDomain();
const today = d(2026, 11, 11); // Wednesday; this week = 9–15 Nov, next week = 16–22 Nov
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      detail: 'งาน ' + seq,
      status: 'กำลังพัฒนา',
      developer: 'Dev-1',
      pm: 'PM-A',
      ...o,
    },
    today,
  );

const rows = [
  mk(1, { dueDate: '1/11/2026' }), // overdue 10 days
  mk(2, { dueDate: '9/11/2026', urgency: 'ด่วนที่สุด' }), // overdue 2 days, top urgency
  mk(3, { dueDate: '12/11/2026', urgency: 'ด่วนที่สุด' }), // this week, top urgency → urgent
  mk(4, { dueDate: '15/11/2026' }), // this week (Sunday)
  mk(5, { dueDate: '16/11/2026' }), // next week (Monday)
  mk(6, { dueDate: '22/11/2026' }), // next week (Sunday)
  mk(7, { dueDate: '23/11/2026' }), // later
  mk(8, { dueDate: '' }), // no due date
  mk(9, { status: '0.แก้ไขเรียบร้อย', doneDate: '10/11/2026', dueDate: '1/11/2026' }), // done this week
  mk(10, { status: '0.แก้ไขเรียบร้อย', doneDate: '1/11/2026' }), // done last week
  mk(11, { dueDate: '1/11/2026', developer: 'Dev-2' }), // someone else
];

describe('groupMyWeek', () => {
  const g = D.groupMyWeek(rows, 'Dev-1', 'developer', today);
  const ids = (list) => list.map((r) => r.id);

  it('splits my open work into overdue / this week / next week / later / no due', () => {
    expect(ids(g.overdue)).toEqual(['1', '2']); // longest overdue first
    expect(ids(g.thisWeek)).toEqual(['3', '4']);
    expect(ids(g.nextWeek)).toEqual(['5', '6']);
    expect(ids(g.later)).toEqual(['7']);
    expect(ids(g.noDue)).toEqual(['8']);
  });

  it('urgent = overdue plus anything marked ด่วนที่สุด, most pressing first', () => {
    expect(ids(g.urgent)).toEqual(['1', '2', '3']);
  });

  it('counts what I finished this week (for encouragement)', () => {
    expect(ids(g.doneThisWeek)).toEqual(['9']);
    expect(g.openTotal).toBe(8);
  });

  it('works for the PM role and for unknown names', () => {
    expect(D.groupMyWeek(rows, 'PM-A', 'pm', today).openTotal).toBe(9);
    expect(D.groupMyWeek(rows, '', 'developer', today).openTotal).toBe(0);
  });
});

describe('overdueBuckets', () => {
  it('groups overdue items by how long they are late, with ids for drill-down', () => {
    const r = [
      mk(1, { dueDate: '10/11/2026' }), // 1 day
      mk(2, { dueDate: '4/11/2026' }), // 7 days
      mk(3, { dueDate: '3/11/2026' }), // 8 days
      mk(4, { dueDate: '28/10/2026' }), // 14 days
      mk(5, { dueDate: '12/10/2026' }), // 30 days
      mk(6, { dueDate: '1/10/2026' }), // 41 days
      mk(7, { dueDate: '30/11/2026' }), // not overdue
    ];
    expect(D.overdueBuckets(r).map((b) => [b.label, b.ids])).toEqual([
      ['1–7 วัน', ['1', '2']],
      ['8–14 วัน', ['3', '4']],
      ['15–30 วัน', ['5']],
      ['เกิน 30 วัน', ['6']],
    ]);
  });
});
