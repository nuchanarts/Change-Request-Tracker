import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "อยากให้ dev กรองดูงานตัวเอง ในงานของฉันได้ง่าย" (user, 2026-11-11)
const D = loadDomain();
const today = d(2026, 11, 11);
const mk = (seq, o) =>
  D.enrich({ rowNumber: seq + 1, seq: String(seq), detail: 'งาน ' + seq, developer: 'แดง', ...o }, today);

describe('stageOf', () => {
  it('groups statuses the way the team talks about them', () => {
    expect(D.stageOf('0.จัดทำไฟล์แก้ไข')).toBe('prep');
    expect(D.stageOf('0.รอแจ้งทีมพัฒนา')).toBe('prep');
    expect(D.stageOf('รอทีมพัฒนา')).toBe('dev');
    expect(D.stageOf('dev ขอ Sourecode อจ.')).toBe('dev');
    expect(D.stageOf('กำลังพัฒนา')).toBe('dev');
    expect(D.stageOf('ส่งกลับนักพัฒนาแก้ไข')).toBe('back');
    expect(D.stageOf('กำลังทดสอบ')).toBe('test');
    expect(D.stageOf('รอ Complie ต้องแจ้งอจ.')).toBe('test');
    expect(D.stageOf('0.แก้ไขเรียบร้อย')).toBe('done');
    expect(D.stageOf('0.ยกเลิก')).toBe('done');
    expect(D.stageOf('อะไรก็ไม่รู้')).toBe('other');
  });
  it('every stage has a Thai label', () => {
    ['prep', 'dev', 'back', 'test'].forEach((k) => expect(D.STAGE_LABELS[k]).toBeTruthy());
  });
});

describe('filterMyWork', () => {
  const rows = [
    mk(1, { platform: 'EHP', status: 'กำลังพัฒนา', system: 'ห้องยา' }),
    mk(2, { platform: 'NHIP', status: 'ส่งกลับนักพัฒนาแก้ไข', system: 'เวชระเบียน' }),
    mk(3, { platform: 'EHP', status: 'กำลังทดสอบ', detail: 'แก้รายงาน Dispensary' }),
  ];
  const ids = (f) => D.filterMyWork(rows, f).map((r) => r.id);
  it('no filter keeps everything', () => expect(ids({})).toEqual(['1', '2', '3']));
  it('by platform', () => expect(ids({ platform: 'EHP' })).toEqual(['1', '3']));
  it('by stage', () => expect(ids({ stage: 'back' })).toEqual(['2']));
  it('by text or number', () => {
    expect(ids({ q: 'dispensary' })).toEqual(['3']);
    expect(ids({ q: '2' })).toEqual(['2']);
  });
  it('filters combine', () => expect(ids({ platform: 'EHP', stage: 'dev' })).toEqual(['1']));
  it('keeps closed items so "ปิดได้สัปดาห์นี้" still works with a platform filter', () => {
    const done = mk(4, { platform: 'EHP', status: '0.แก้ไขเรียบร้อย', doneDate: '10/11/2026' });
    expect(D.filterMyWork(rows.concat(done), { platform: 'EHP', stage: 'dev' }).map((r) => r.id)).toEqual([
      '1',
      '4',
    ]);
  });
});
