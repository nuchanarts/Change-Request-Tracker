import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "แต่ละหน้าให้เลือกดูเฉพาะงาน PM แก๊ส+ป้องเป็น เฉพาะ EHP/NHIP และ แพท ส้ม เป็น EHP INET" (user, 2026-11-16):
// two PM-team choices in the shared PM filter, next to the single PMs.
const D = loadDomain();
const today = d(2026, 11, 16);
const PMS = ['นุชนารถ (แก๊ส)', 'วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)', 'กษิดิ์เดช (พี่ป้อง)'];
const mk = (seq, pm) =>
  D.enrich({ rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'กำลังพัฒนา', pm }, today);

describe('PM team filter', () => {
  it('offers one choice per team, named by the team only (no PM names, user 2026-11-16)', () => {
    expect(D.pmTeams(PMS)).toEqual([
      { label: 'ทีม EHP/NHIP', pms: ['นุชนารถ (แก๊ส)', 'กษิดิ์เดช (พี่ป้อง)'] },
      { label: 'ทีม EHP INET', pms: ['วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)'] },
    ]);
  });

  it('turns a team choice into its PMs, a single PM into itself, empty into no filter', () => {
    expect(D.pmFilter('ทีม EHP/NHIP', PMS)).toEqual(['นุชนารถ (แก๊ส)', 'กษิดิ์เดช (พี่ป้อง)']);
    expect(D.pmFilter('ทีม EHP INET', PMS)).toEqual(['วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)']);
    expect(D.pmFilter('วนิดา (แพท)', PMS)).toEqual(['วนิดา (แพท)']);
    expect(D.pmFilter('', PMS)).toEqual([]);
  });

  it('keeps only the chosen team rows (shared rows too) and hides other or empty PMs', () => {
    const rows = [
      mk(1, 'นุชนารถ (แก๊ส)'),
      mk(2, 'กษิดิ์เดช (พี่ป้อง)'),
      mk(3, 'วนิดา (แพท)'),
      mk(4, 'คนอื่น'),
      mk(5, ''),
      mk(6, 'ทิพวรรณ (พี่ส้ม), นุชนารถ (แก๊ส)'),
    ];
    const seqs = (label) => D.applyFilters(rows, { pm: D.pmFilter(label, PMS) }).map((r) => r.seq);
    expect(seqs('ทีม EHP/NHIP')).toEqual([1, 2, 6]);
    expect(seqs('ทีม EHP INET')).toEqual([3, 6]);
  });

  it('leaves out a team whose PMs are not in the PM list', () => {
    expect(D.pmTeams(['วนิดา (แพท)'])).toEqual([{ label: 'ทีม EHP INET', pms: ['วนิดา (แพท)'] }]);
  });
});

// "ทำตรง งาน PM ด้วย" (user, 2026-11-16): the งาน PM page can show a whole PM team.
describe('งาน PM for a team', () => {
  const rows = [
    mk(1, 'นุชนารถ (แก๊ส)'),
    mk(2, 'กษิดิ์เดช (พี่ป้อง)'),
    mk(3, 'วนิดา (แพท)'),
    mk(4, 'ทิพวรรณ (พี่ส้ม), นุชนารถ (แก๊ส)'),
  ];
  const team = D.pmFilter('ทีม EHP/NHIP', PMS);
  const openOf = (g) => ['overdue', 'thisWeek', 'nextWeek', 'later', 'noDue'].flatMap((k) => g[k]);
  const seqs = (list) => list.map((r) => r.seq).sort((a, b) => a - b);

  it('groupMyWeek takes the team PMs and counts each row once', () => {
    expect(seqs(openOf(D.groupMyWeek(rows, team, 'pm', today)))).toEqual([1, 2, 4]);
  });

  it('groupMyWork takes the team PMs too', () => {
    const g = D.groupMyWork(rows, team, 'pm', today);
    expect(g.total).toBe(3);
  });

  it('a single PM name still works as before', () => {
    expect(seqs(openOf(D.groupMyWeek(rows, 'วนิดา (แพท)', 'pm', today)))).toEqual([3]);
  });
});
