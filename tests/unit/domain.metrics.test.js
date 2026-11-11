import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';
import { generateRows } from '../fixtures/generate.js';

const D = loadDomain();
const today = d(2026, 11, 11); // Wednesday

const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      platform: 'EHP',
      urgency: 'ปกติ',
      status: 'กำลังพัฒนา',
      detail: 'งาน ' + seq,
      pm: 'PM-A',
      developer: 'Dev-1',
      dueDate: '30/11/2026',
      ...o,
    },
    today,
  );

const rows = [
  mk(1, {}), // open, not overdue
  mk(2, { dueDate: '1/11/2026' }), // overdue 10 days
  mk(3, { dueDate: '1/11/2026', postponedDate: '20/11/2026' }), // postponed → not overdue
  mk(4, { status: '0.รอแจ้งทีมพัฒนา', developer: '', dueDate: '10/11/2026' }), // open, unassigned, overdue 1
  mk(5, { status: '0.แก้ไขเรียบร้อย', doneDate: '10/11/2026' }), // closed this week + month
  mk(6, { status: '0.ยกเลิก', doneDate: '2/11/2026' }), // closed this month, last week
  mk(7, { status: '0.ใช้งานได้อยู่แล้ว', doneDate: '15/10/2026' }), // closed last month
  mk(8, { status: 'รอ compile', dueDate: '', pm: 'PM-B', developer: 'Dev-2' }), // open, no due
  mk(9, { status: '', dueDate: '5/11/2026', developer: 'Dev-2', pm: 'PM-B' }), // empty status = open, overdue 6
];

describe('computeMetrics (constitution VII, FR-010)', () => {
  const m = D.computeMetrics(rows, today);

  it('Q1: counts open and overdue', () => {
    expect(m.openCount).toBe(6);
    expect(m.overdueCount).toBe(3);
    expect(m.openIds.sort()).toEqual(['1', '2', '3', '4', '8', '9']);
  });

  it('Q2: open items by status in workflow order, empty status labelled', () => {
    expect(m.byStatus.map((s) => [s.status, s.count])).toEqual([
      ['0.รอแจ้งทีมพัฒนา', 1],
      ['กำลังพัฒนา', 3],
      ['รอ compile', 1],
      ['(ไม่ระบุสถานะ)', 1],
    ]);
  });

  it('Q3: open and overdue per developer, with an unassigned bucket', () => {
    const dev = Object.fromEntries(m.byDeveloper.map((x) => [x.name, [x.open, x.overdue]]));
    expect(dev).toEqual({ 'Dev-1': [3, 1], 'Dev-2': [2, 1], ยังไม่มอบหมาย: [1, 1] });
    expect(m.byDeveloper[0].name).toBe('Dev-1'); // sorted by open desc
  });

  it('Q4: open per PM', () => {
    expect(m.byPm.map((x) => [x.name, x.open])).toEqual([
      ['PM-A', 4],
      ['PM-B', 2],
    ]);
  });

  it('Q5: closed this week and this month by วันที่เสร็จ', () => {
    expect(m.closedThisWeek.ids).toEqual(['5']);
    expect(m.closedThisMonth.ids.sort()).toEqual(['5', '6']);
  });

  it('Q6: overdue list sorted by days overdue desc', () => {
    expect(m.overdueList.map((r) => [r.id, r.overdueDays])).toEqual([
      ['2', 10],
      ['9', 6],
      ['4', 1],
    ]);
  });

  it('no-due bucket for open items', () => {
    expect(m.noDue.ids).toEqual(['8']);
  });

  it('every drill-down id list length equals its number', () => {
    expect(m.openIds.length).toBe(m.openCount);
    expect(m.overdueIds.length).toBe(m.overdueCount);
    m.byStatus.forEach((s) => expect(s.ids.length).toBe(s.count));
    m.byDeveloper.forEach((x) => {
      expect(x.ids.length).toBe(x.open);
      expect(x.overdueIds.length).toBe(x.overdue);
    });
  });
});

describe('applyFilters (FR-012)', () => {
  it('returns all rows with empty filters', () => {
    expect(D.applyFilters(rows, {}).length).toBe(rows.length);
  });

  it('filters by developer and PM (multi-value)', () => {
    expect(D.applyFilters(rows, { developer: ['Dev-2'] }).map((r) => r.id)).toEqual(['8', '9']);
    expect(D.applyFilters(rows, { pm: ['PM-B'], developer: ['Dev-2'] }).length).toBe(2);
  });

  it('filters unassigned developer with the special value', () => {
    expect(D.applyFilters(rows, { developer: [D.UNASSIGNED] }).map((r) => r.id)).toEqual(['4']);
  });

  it('filters by due date range on the effective due date (inclusive), excluding no-due rows', () => {
    const ids = D.applyFilters(rows, { dateFrom: d(2026, 11, 1), dateTo: d(2026, 11, 10) }).map((r) => r.id);
    expect(ids).toEqual(['2', '4', '9']);
  });

  it('filters by status and open/closed state', () => {
    expect(D.applyFilters(rows, { status: ['รอ compile'] }).map((r) => r.id)).toEqual(['8']);
    expect(D.applyFilters(rows, { state: 'closed' }).length).toBe(3);
    expect(D.applyFilters(rows, { state: 'overdue' }).length).toBe(3);
  });

  it('filters by ids for drill-down', () => {
    expect(D.applyFilters(rows, { ids: ['2', '9'] }).map((r) => r.id)).toEqual(['2', '9']);
  });
});

describe('performance (constitution XIV)', () => {
  it('enriches and computes metrics for 1,000 rows in under 200 ms', () => {
    const raw = generateRows(1000, 42);
    const t0 = performance.now();
    const enriched = raw.map((r) => D.enrich(r, today));
    D.computeMetrics(D.applyFilters(enriched, { platform: ['EHP'] }), today);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
