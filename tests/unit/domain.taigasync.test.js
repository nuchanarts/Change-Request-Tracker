// Taiga status shown next to the sheet status (user request 2026-11-24).
// แมวส้ม logs the Taiga events; the app only reads them.
import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

const D = loadDomain();
const URL = 'https://taiga.hosxp.net/project/ehp/us/77';
const KEY = 'taiga.hosxp.net/ehp/us/77';
const ev = (o) => ({ kind: 'สถานะ', link: URL, from: 'New', to: 'In progress', by: 'แดง', at: 1000, ...o });
const row = (seq, o = {}) =>
  D.enrich(
    { rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'รอทีมพัฒนา', ticketLinks: [URL], ...o },
    d(2026, 11, 24),
  );

describe('taigaKey', () => {
  it('identifies an item by site, project, type and number', () => {
    expect(D.taigaKey(URL)).toBe(KEY);
    expect(D.taigaKey('https://TAIGA.hosxp.net/project/EHP/us/77?x=1')).toBe(KEY);
  });

  it('is null without a full item link, so a bare number never matches across projects', () => {
    ['77', '', null, 'https://taiga.hosxp.net/us/77', 'https://taiga.hosxp.net/login'].forEach((u) =>
      expect(D.taigaKey(u)).toBeNull(),
    );
  });
});

describe('taigaLatest', () => {
  it('keeps the newest status and who moved it', () => {
    const l = D.taigaLatest([
      ev(),
      ev({ from: 'In progress', to: 'Done', kind: 'เสร็จ', by: 'ดำ', at: 2000 }),
    ]);
    expect(l[KEY]).toEqual({ status: 'Done', from: 'In progress', by: 'ดำ', at: 2000, deleted: false });
  });

  it('a later comment does not change who moved the card', () => {
    const l = D.taigaLatest([
      ev(),
      ev({ kind: 'คอมเมนต์', from: '', to: 'In progress', by: 'ดำ', at: 2000 }),
    ]);
    expect(l[KEY]).toMatchObject({ status: 'In progress', by: 'แดง', at: 1000 });
  });

  it('marks a deleted item and ignores test events and events without a full link', () => {
    expect(D.taigaLatest([ev(), ev({ kind: 'ลบ' })])[KEY].deleted).toBe(true);
    expect(D.taigaLatest([ev({ kind: 'ทดสอบ' }), ev({ link: '' })])).toEqual({});
  });
});

describe('taigaCompare', () => {
  const latest = D.taigaLatest([ev()]);
  const map = { 'In progress': 'กำลังพัฒนา' };
  const cmp = (r, m = map, rows = [r], l = latest) => D.taigaCompare(r, l, m, D.taigaKeyCounts(rows));

  it('says when the sheet differs from Taiga and what it should be', () => {
    expect(cmp(row(1))).toMatchObject({ state: 'diff', expected: 'กำลังพัฒนา', canApply: true });
  });

  it('matches when the sheet already has the mapped status', () => {
    expect(cmp(row(1, { status: 'กำลังพัฒนา' }))).toMatchObject({ state: 'match', canApply: false });
  });

  it('never guesses: no map entry, an invalid target or an inherited name is "unmapped"', () => {
    expect(cmp(row(1), {}).state).toBe('unmapped');
    expect(cmp(row(1), { 'In progress': 'ไม่มีสถานะนี้' }).state).toBe('unmapped');
    const odd = D.taigaLatest([ev({ to: 'constructor' })]);
    expect(cmp(row(1), {}, [row(1)], odd).state).toBe('unmapped');
  });

  it('has nothing to say without an event or a full link', () => {
    expect(cmp(row(1, { ticketLinks: [] })).state).toBe('none');
    expect(cmp(row(1), map, [row(1)], {}).state).toBe('none');
  });

  it('a deleted Taiga item is shown but never applied', () => {
    const gone = D.taigaLatest([ev(), ev({ kind: 'ลบ' })]);
    expect(cmp(row(1), map, [row(1)], gone)).toMatchObject({ state: 'deleted', canApply: false });
  });

  it('two rows with the same Taiga link are shown but cannot be applied', () => {
    const rows = [row(1), row(2)];
    expect(cmp(rows[0], map, rows)).toMatchObject({ state: 'diff', canApply: false, duplicate: true });
  });

  it('a row without a usable ลำดับ cannot be applied', () => {
    expect(cmp(row(1, { seq: '' }))).toMatchObject({ state: 'diff', canApply: false });
  });
});

describe('taigaEffectiveMap: the team table (user, 2026-11-24) unless an admin changed it', () => {
  it('has the pairs the team gave, with the exact sheet spellings', () => {
    expect(D.taigaEffectiveMap([], [])).toEqual({
      New: '0.จัดทำ Taiga',
      'PM Reviewing': 'รอ PM ตรวจสอบ Taiga',
      'Ready for DEV': 'รอทีมพัฒนา',
      'In progress': 'กำลังพัฒนา',
      'Ready for test': 'กำลังทดสอบ',
      Rework: 'ส่งกลับนักพัฒนาแก้ไข',
      'Waiting Compile': 'รอ compile',
      'compile from dev': 'รอ compile',
      Done: '0.แก้ไขเรียบร้อย',
      Archived: '0.ยกเลิก',
    });
    Object.values(D.taigaEffectiveMap([], [])).forEach((v) => expect(D.WORKFLOW).toContain(v));
  });

  it('matches names as Taiga spells them, ignoring only case and extra spaces', () => {
    const m = D.taigaEffectiveMap(['READY FOR  dev', 'Compile From Dev', 'Ready'], []);
    expect(m['READY FOR  dev']).toBe('รอทีมพัฒนา');
    expect(m['Compile From Dev']).toBe('รอ compile');
    expect(m['Ready for DEV']).toBeUndefined(); // listed once, under Taiga's own spelling
    expect(m.Ready).toBeUndefined(); // similar is not the same
  });

  it('an admin can change or clear a pair, and an invalid target counts as cleared', () => {
    const m = D.taigaEffectiveMap(
      ['Done'],
      [
        { taiga: 'Done', app: 'รอ compile' },
        { taiga: 'Archived', app: '' },
        { taiga: 'New', app: 'พิมพ์เอง' },
        { taiga: 'Extra', app: 'กำลังทดสอบ' },
      ],
    );
    expect(m.Done).toBe('รอ compile');
    expect(m).not.toHaveProperty('Archived');
    expect(m).not.toHaveProperty('New');
    expect(m.Extra).toBe('กำลังทดสอบ');
  });

  it('a pair saved under another letter case still wins over the default', () => {
    expect(D.taigaEffectiveMap(['done'], [{ taiga: 'Done', app: '' }])).not.toHaveProperty('done');
  });
});

describe('devBeforeReview: developed while the PM has not passed the Taiga item (user, 2026-11-24)', () => {
  const today = d(2026, 11, 24);
  const check = (o, taigaStatus, kind = 'สถานะ') => {
    const r = row(1, o);
    const l = taigaStatus ? D.taigaLatest([ev({ to: taigaStatus, kind })]) : {};
    const c = D.taigaCompare(r, l, D.taigaEffectiveMap([], []), D.taigaKeyCounts([r]));
    return D.devBeforeReview(r, c, today);
  };
  const WAIT = ['รอ PM ตรวจสอบ Taiga', '0.PM ส่งกลับแก้ไข Taiga'];

  it('the sheet is at one of the two PM review statuses and Taiga is in development or later', () => {
    WAIT.forEach((status) =>
      ['In progress', 'Rework', 'Ready for test', 'Waiting Compile', 'compile from dev', 'Done'].forEach(
        (t) => expect(check({ status }, t)).toEqual(['Taiga: ' + t]),
      ),
    );
  });

  it('only those two sheet statuses count (user, 2026-11-24)', () => {
    D.WORKFLOW.concat('')
      .filter((status) => !WAIT.includes(status))
      .forEach((status) => {
        expect(check({ status, devStart: '20/11/2026' }, 'In progress')).toBeNull();
        expect(check({ status, devStart: '20/11/2026' }, 'PM Reviewing')).toBeNull();
        expect(check({ status, devStart: '20/11/2026' }, 'New')).toBeNull();
      });
  });

  it('a start or finish date in the sheet counts, even without Taiga data', () => {
    expect(check({ status: WAIT[0], devStart: '20/11/2026' })).toEqual(['เริ่มพัฒนา 20/11/2026']);
    expect(check({ status: WAIT[1], devEnd: '24/11/2026' })).toEqual(['พัฒนาเสร็จ 24/11/2026']);
    expect(D.devBeforeReview(row(1, { status: WAIT[0], devStart: '1/11/2026' }), null, today)).not.toBeNull();
  });

  it('a planned (future) or unreadable date is not development', () => {
    expect(check({ status: WAIT[0], devStart: '25/11/2026' })).toBeNull();
    expect(check({ status: WAIT[0], devStart: 'ปลายเดือน' })).toBeNull();
  });

  it('is quiet when Taiga has not started, is cancelled, unknown or deleted', () => {
    ['New', 'PM Reviewing', 'Ready for DEV', 'Archived', 'Strange'].forEach((t) =>
      expect(check({ status: WAIT[0] }, t)).toBeNull(),
    );
    expect(check({ status: WAIT[0] }, 'In progress', 'ลบ')).toBeNull();
  });
});

describe('sheet statuses without exactly one Taiga status (user, 2026-11-25)', () => {
  const base = D.taigaEffectiveMap([], []);

  it('lists statuses with no Taiga status, and those with several, in workflow order', () => {
    expect(D.statusTaigaGaps(base, {})).toEqual([
      { app: '0.จัดทำไฟล์แก้ไข', several: [] },
      { app: '0.PM ส่งกลับแก้ไข Taiga', several: [] },
      { app: '0.รอแจ้งทีมพัฒนา', several: [] },
      { app: 'dev ขอ Sourecode อจ.', several: [] },
      { app: 'รอ compile', several: ['Waiting Compile', 'compile from dev'] },
      { app: 'รอ Complie ต้องแจ้งอจ.', several: [] },
      { app: '0.ใช้งานได้อยู่แล้ว', several: [] },
    ]);
  });

  it('a saved pair stays listed, so it can be changed even after the status gets its own pair', () => {
    const gaps = D.statusTaigaGaps(base, { กำลังพัฒนา: 'Rework' });
    expect(gaps.map((g) => g.app)).toContain('กำลังพัฒนา');
    expect(gaps).toHaveLength(8);
  });

  it('reads only pairs whose status is in the workflow and whose Taiga name is not empty', () => {
    expect(
      D.statusTaigaMap([
        { app: '0.รอแจ้งทีมพัฒนา', taiga: ' Ready for DEV ' },
        { app: 'พิมพ์เอง', taiga: 'New' },
        { app: 'รอ compile', taiga: '' },
      ]),
    ).toEqual({ '0.รอแจ้งทีมพัฒนา': 'Ready for DEV' });
  });

  it('knows the Taiga names once each, whatever the letter case', () => {
    const names = D.taigaNames(
      ['done', 'Strange'],
      { 'In progress': 'กำลังพัฒนา' },
      { 'รอ compile': 'Kept' },
    );
    expect(names).toEqual(expect.arrayContaining(['done', 'Strange', 'In progress', 'Kept', 'Archived']));
    expect(names).not.toContain('Done');
    expect(new Set(names.map(D.taigaName)).size).toBe(names.length);
  });

  describe('taigaCompare with these pairs', () => {
    const cmp = (status, to, appMap) => {
      const r = row(1, { status });
      return D.taigaCompare(r, D.taigaLatest([ev({ to })]), base, D.taigaKeyCounts([r]), appMap);
    };

    it('a paired status matches and cannot be applied', () => {
      expect(cmp('0.รอแจ้งทีมพัฒนา', 'Ready for DEV', {})).toMatchObject({ state: 'diff' });
      expect(
        cmp('0.รอแจ้งทีมพัฒนา', 'ready for  dev', { '0.รอแจ้งทีมพัฒนา': 'Ready for DEV' }),
      ).toMatchObject({
        state: 'match',
        expected: '0.รอแจ้งทีมพัฒนา',
        canApply: false,
      });
      expect(cmp('0.รอแจ้งทีมพัฒนา', 'Strange', { '0.รอแจ้งทีมพัฒนา': 'Strange' }).state).toBe('match');
    });

    it('the pair of another status, or another Taiga status, changes nothing', () => {
      expect(cmp('กำลังทดสอบ', 'Ready for DEV', { '0.รอแจ้งทีมพัฒนา': 'Ready for DEV' }).state).toBe('diff');
      expect(cmp('0.รอแจ้งทีมพัฒนา', 'Done', { '0.รอแจ้งทีมพัฒนา': 'Ready for DEV' })).toMatchObject({
        state: 'diff',
        expected: '0.แก้ไขเรียบร้อย',
      });
    });

    it('choosing one of several still accepts the others', () => {
      expect(cmp('รอ compile', 'compile from dev', { 'รอ compile': 'Waiting Compile' }).state).toBe('match');
    });

    it('a deleted item and an empty status never match', () => {
      const r = row(1, { status: '' });
      const gone = D.taigaLatest([ev({ to: 'Done' }), ev({ to: '', kind: 'ลบ' })]);
      expect(D.taigaCompare(r, gone, base, {}, { '': 'Done' }).state).toBe('deleted');
      expect(cmp('', 'Done', {}).state).toBe('diff');
    });
  });
});

describe('sending the sheet status to Taiga: which Taiga status (user, 2026-11-25)', () => {
  const base = D.taigaEffectiveMap([], []);
  const APP = '0.รอแจ้งทีมพัฒนา';

  it('is the pair made by hand, else the only Taiga status of that sheet status, else nothing', () => {
    expect(D.statusTaigaTarget('กำลังพัฒนา', base, {})).toBe('In progress');
    expect(D.statusTaigaTarget('กำลังพัฒนา', base, { กำลังพัฒนา: 'Rework' })).toBe('Rework');
    expect(D.statusTaigaTarget(APP, base, {})).toBe('');
    expect(D.statusTaigaTarget(APP, base, { [APP]: 'Ready for DEV' })).toBe('Ready for DEV');
    expect(D.statusTaigaTarget('รอ compile', base, {})).toBe(''); // two Taiga statuses: never guess
    expect(D.statusTaigaTarget('', base, {})).toBe('');
    expect(D.statusTaigaTarget('constructor', base, {})).toBe('');
  });

  const cmp = (o, to, appMap = {}, rows) => {
    const r = row(1, o);
    return D.taigaCompare(r, D.taigaLatest([ev({ to })]), base, D.taigaKeyCounts(rows || [r]), appMap);
  };

  it('is offered when the two differ, also when the Taiga status is not paired', () => {
    expect(cmp({ status: 'กำลังทดสอบ' }, 'In progress')).toMatchObject({
      state: 'diff',
      pushTo: 'Ready for test',
    });
    expect(cmp({ status: 'กำลังทดสอบ' }, 'Strange')).toMatchObject({
      state: 'unmapped',
      pushTo: 'Ready for test',
    });
  });

  it('is never offered when they match, without a pair, for a shared link, a deleted item or no ลำดับ', () => {
    expect(cmp({ status: 'กำลังพัฒนา' }, 'In progress').pushTo).toBe('');
    expect(cmp({ status: APP }, 'In progress').pushTo).toBe('');
    expect(cmp({ status: 'กำลังทดสอบ' }, 'In progress', {}, [row(1), row(2)]).pushTo).toBe('');
    expect(cmp({ status: 'กำลังทดสอบ', seq: '' }, 'In progress').pushTo).toBe('');
    const gone = D.taigaLatest([ev(), ev({ kind: 'ลบ' })]);
    const r = row(1, { status: 'กำลังทดสอบ' });
    expect(D.taigaCompare(r, gone, base, {}, {}).pushTo).toBe('');
  });
});
