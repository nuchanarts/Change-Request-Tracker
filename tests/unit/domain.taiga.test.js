import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "อยากให้มีทะเบียน ความคืบหน้า taiga" (user, 2026-11-20): a register of the items that have a Taiga ticket
// (or are in a Taiga step), with how far each one has come along the workflow.
const D = loadDomain();
const today = d(2026, 11, 20);
const TG = 'https://tree.taiga.io/project/bgs/us/';
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      platform: 'EHP',
      system: 'OPD',
      detail: 'งาน ' + seq,
      status: 'กำลังพัฒนา',
      pm: 'PM-A',
      dueDate: '30/11/2026',
      ...o,
    },
    today,
  );

describe('taigaLink', () => {
  it('finds a Taiga link in the cell links or typed text, never a MANTIS one', () => {
    expect(D.taigaLink(mk(1, { ticket: TG + '12' }))).toBe(TG + '12');
    expect(
      D.taigaLink(mk(2, { ticket: '', ticketLinks: ['https://mantis.x/view.php?id=3', TG + '7'] })),
    ).toBe(TG + '7');
    expect(D.taigaLink(mk(3, { ticket: 'https://mantis.x/view.php?id=3' }))).toBe(null);
    expect(D.taigaLink(mk(4, { ticket: '' }))).toBe(null);
  });
});

describe('progressOf', () => {
  const n = D.WORKFLOW.length - D.CLOSED.length;
  it('open steps count up in workflow order and never reach 100%', () => {
    const first = D.progressOf('0.จัดทำไฟล์แก้ไข');
    expect(first).toMatchObject({ step: 1, total: n, state: 'open' });
    const last = D.progressOf('รอ Complie ต้องแจ้งอจ.');
    expect(last.step).toBe(n);
    expect(last.pct).toBeLessThan(100);
    expect(D.progressOf('กำลังทดสอบ').pct).toBeGreaterThan(D.progressOf('กำลังพัฒนา').pct);
  });
  it('closed is 100%, cancelled has no bar, an unknown status is flagged', () => {
    expect(D.progressOf('0.แก้ไขเรียบร้อย')).toMatchObject({ pct: 100, state: 'done' });
    expect(D.progressOf('0.ใช้งานได้อยู่แล้ว')).toMatchObject({ pct: 100, state: 'done' });
    expect(D.progressOf('0.ยกเลิก')).toMatchObject({ pct: null, state: 'cancelled' });
    expect(D.progressOf('อะไรสักอย่าง')).toMatchObject({ step: null, state: 'unknown' });
    expect(D.progressOf('')).toMatchObject({ step: null, state: 'unknown' });
  });
});

describe('taigaRegister', () => {
  const rows = [
    mk(1, { ticket: TG + '1' }),
    mk(2, { ticket: TG + '2', status: '0.แก้ไขเรียบร้อย' }),
    mk(3, { status: '0.จัดทำ Taiga', ticket: '' }), // in a Taiga step but no link yet
    mk(4, { ticket: 'https://mantis.x/view.php?id=4' }), // not Taiga
    mk(5, { ticket: '' }), // nothing to do with Taiga
    mk(6, { ticket: TG + '6', status: '0.PM ส่งกลับแก้ไข Taiga' }),
  ];
  const seqs = (rep) => rep.rows.map((r) => r.seq);
  it('open (default): items with a Taiga link or in a Taiga step, newest first', () => {
    const rep = D.taigaRegister(rows, {});
    expect(seqs(rep)).toEqual([6, 3, 1]);
    expect(rep.total).toBe(3);
    expect(rep.noLink).toBe(1);
  });
  it('closed and all', () => {
    expect(seqs(D.taigaRegister(rows, { scope: 'closed' }))).toEqual([2]);
    expect(seqs(D.taigaRegister(rows, { scope: 'all' }))).toEqual([6, 3, 2, 1]);
  });
  it('kind "all" keeps every item, but only Taiga-step items count as missing a link (2026-11-25)', () => {
    const rep = D.taigaRegister(rows, { kind: 'all' });
    expect(seqs(rep)).toEqual([6, 5, 4, 3, 1]);
    expect(rep.noLink).toBe(1);
    expect(seqs(D.taigaRegister(rows, { kind: 'all', scope: 'closed' }))).toEqual([2]);
  });
  it('scope "overdue" keeps overdue open items', () => {
    const late = [...rows, mk(7, { ticket: TG + '7', dueDate: '1/11/2026' })];
    expect(seqs(D.taigaRegister(late, { scope: 'overdue' }))).toEqual([7]);
  });
  it('counts per status in workflow order', () => {
    const rep = D.taigaRegister(rows, { scope: 'all' });
    expect(rep.byStatus.map((s) => s.status)).toEqual([
      '0.จัดทำ Taiga',
      '0.PM ส่งกลับแก้ไข Taiga',
      'กำลังพัฒนา',
      '0.แก้ไขเรียบร้อย',
    ]);
  });
});

describe('taigaRegisterCsv', () => {
  it('has the Taiga link and progress columns and guards formulas', () => {
    const rows = [mk(1, { ticket: TG + '1', detail: '=SUM(A1)' })];
    const lines = D.taigaRegisterCsv(rows).split('\r\n');
    expect(lines[0]).toContain('ลิงก์ Taiga');
    expect(lines[0]).toContain('ความคืบหน้า');
    expect(lines[1]).toContain(TG + '1');
    expect(lines[1]).toContain("'=SUM(A1)");
    expect(lines[1]).toMatch(/ขั้น \d+\/\d+/);
  });
});
