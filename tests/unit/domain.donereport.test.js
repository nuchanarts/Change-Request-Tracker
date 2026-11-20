import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// Monthly "closed work" report (user request 2026-11-20): pick statuses, filter by วันที่เสร็จ, export CSV.
const D = loadDomain();
const today = d(2026, 11, 20);
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      platform: 'EHP',
      system: 'OPD',
      detail: 'งาน ' + seq,
      status: '0.แก้ไขเรียบร้อย',
      developer: 'Dev-1',
      pm: 'PM-A',
      dueDate: '30/11/2026',
      ...o,
    },
    today,
  );

const rows = [
  mk(1, { doneDate: '15/11/2026' }),
  mk(2, { doneDate: '3/11/2026' }),
  mk(3, { doneDate: '30/10/2026' }),
  mk(4, { status: '0.ยกเลิก', doneDate: '10/11/2026' }),
  mk(5, { status: '0.ใช้งานได้อยู่แล้ว', doneDate: '1/12/2025' }),
  mk(6, { status: 'กำลังพัฒนา' }),
  mk(7, { doneDate: '' }), // done but no วันที่เสร็จ
  mk(8, { doneDate: '3/11/2026' }),
];
const seqs = (rep) => rep.rows.map((r) => r.seq);

describe('doneRange', () => {
  it('month, year, custom range and all', () => {
    expect(D.doneRange({ mode: 'month', y: 2026, m: 2 })).toEqual({
      from: d(2026, 2, 1),
      to: d(2026, 2, 28),
    });
    expect(D.doneRange({ mode: 'year', y: 2026 })).toEqual({ from: d(2026, 1, 1), to: d(2026, 12, 31) });
    expect(D.doneRange({ mode: 'range', from: d(2026, 1, 5), to: null })).toEqual({
      from: d(2026, 1, 5),
      to: null,
    });
    expect(D.doneRange({ mode: 'all' })).toBeNull();
    expect(D.doneRange(null)).toBeNull();
  });
});

describe('doneReport', () => {
  it('default: only 0.แก้ไขเรียบร้อย with วันที่เสร็จ in the chosen month, sorted by date then ลำดับ', () => {
    const rep = D.doneReport(rows, { statuses: [D.DONE], period: { mode: 'month', y: 2026, m: 11 } });
    expect(seqs(rep)).toEqual([2, 8, 1]);
    expect(rep.total).toBe(3);
    expect(rep.byStatus).toEqual([{ status: '0.แก้ไขเรียบร้อย', count: 3 }]);
    expect(rep.noDoneDate).toBe(1); // ลำดับ 7 matches the status but has no วันที่เสร็จ
  });

  it('several statuses (all closed) and the counts per status', () => {
    const rep = D.doneReport(rows, { statuses: D.CLOSED, period: { mode: 'month', y: 2026, m: 11 } });
    expect(seqs(rep)).toEqual([2, 8, 4, 1]);
    expect(rep.byStatus).toEqual([
      { status: '0.แก้ไขเรียบร้อย', count: 3 },
      { status: '0.ยกเลิก', count: 1 },
    ]);
  });

  it('year and custom range use วันที่เสร็จ', () => {
    expect(seqs(D.doneReport(rows, { statuses: [D.DONE], period: { mode: 'year', y: 2026 } }))).toEqual([
      3, 2, 8, 1,
    ]);
    const r = D.doneReport(rows, {
      statuses: [],
      period: { mode: 'range', from: d(2025, 12, 1), to: d(2026, 10, 31) },
    });
    expect(seqs(r)).toEqual([5, 3]);
  });

  it('no date filter: every row of the statuses, rows without วันที่เสร็จ last', () => {
    const rep = D.doneReport(rows, { statuses: [D.DONE], period: { mode: 'all' } });
    expect(seqs(rep)).toEqual([3, 2, 8, 1, 7]);
    expect(rep.noDoneDate).toBe(0);
  });

  it('an empty status list means every status', () => {
    expect(D.doneReport(rows, { statuses: [], period: { mode: 'all' } }).total).toBe(8);
  });

  it('uses exact status values, never a prefix', () => {
    const odd = [mk(9, { status: '0.แก้ไขเรียบร้อยแล้ว', doneDate: '5/11/2026' })];
    expect(D.doneReport(odd, { statuses: [D.DONE], period: { mode: 'all' } }).total).toBe(0);
  });
});

describe('doneYears', () => {
  it('years found in วันที่เสร็จ plus this year, newest first', () => {
    expect(D.doneYears(rows, today)).toEqual([2026, 2025]);
    expect(D.doneYears([], d(2027, 1, 1))).toEqual([2027]);
  });
});

describe('doneReportCsv', () => {
  it('header row + one line per item, quoting commas, quotes and newlines', () => {
    const r = mk(10, {
      detail: 'แก้ "ปุ่ม", หน้าจอ\nบรรทัดสอง',
      doneDate: '5/11/2026',
      ticket: '2252',
      pm: 'PM-A, PM-B',
    });
    const csv = D.doneReportCsv([r]);
    const lines = csv.split('\r\n');
    expect(lines[0].split(',').slice(0, 3)).toEqual(['ลำดับ', 'แพลตฟอร์ม', 'ประเภทปัญหา']);
    expect(lines[0]).toContain('วันที่เสร็จ');
    expect(csv).toContain('"แก้ ""ปุ่ม"", หน้าจอ\nบรรทัดสอง"');
    expect(csv).toContain('"PM-A, PM-B"');
    expect(csv).toContain(',5/11/2026,');
    expect(csv.startsWith('10') || lines[1].startsWith('10,')).toBe(true);
  });

  it('guards against spreadsheet formulas in cell text', () => {
    const r = mk(11, { detail: '=HYPERLINK("x")', doneDate: '5/11/2026' });
    expect(D.doneReportCsv([r])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
