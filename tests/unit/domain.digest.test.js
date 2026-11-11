import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// Monday digest for LINE (แมวส้ม sends it; the app only builds the text). User request 2026-11-11.
const D = loadDomain();
const today = d(2026, 11, 16); // Monday
const mk = (seq, o) =>
  D.enrich(
    {
      rowNumber: seq + 1,
      seq: String(seq),
      detail: 'งาน ' + seq,
      status: 'กำลังพัฒนา',
      developer: 'แดง',
      ...o,
    },
    today,
  );

const rows = [
  mk(1, { dueDate: '1/11/2026' }), // แดง overdue 15 days
  mk(2, { dueDate: '18/11/2026' }), // แดง this week
  mk(3, { dueDate: '10/11/2026', developer: 'ดำ' }), // ดำ overdue 6 days
  mk(4, { dueDate: '30/11/2026', developer: 'ดำ' }), // ดำ later → not listed
  mk(5, { dueDate: '1/11/2026', developer: '' }), // unassigned
  mk(6, { dueDate: '1/11/2026', status: '0.แก้ไขเรียบร้อย', doneDate: '12/11/2026' }), // closed last week
];

describe('buildDigest', () => {
  const msgs = D.buildDigest(rows, today, { appUrl: 'https://nuchanarts.github.io/Change-Request-Tracker/' });
  const text = msgs.join('\n');

  it('has a header with the week and team totals', () => {
    expect(msgs[0]).toMatch(/^📋 สรุปงานประจำสัปดาห์ 16–22 พ\.ย\. 69/);
    expect(msgs[0]).toContain('งานค้าง 5 งาน');
    expect(msgs[0]).toContain('เกินกำหนด 3 งาน');
    expect(msgs[0]).toContain('ยังไม่มอบหมาย 1 งาน');
  });

  it('lists each developer with overdue (days late) and this week, most overdue first', () => {
    expect(text.indexOf('แดง')).toBeLessThan(text.indexOf('ดำ'));
    expect(text).toContain('#1 งาน 1 (เกิน 15 วัน)');
    expect(text).toContain('#2 งาน 2 (18 พ.ย. 69)');
    expect(text).toContain('#3 งาน 3 (เกิน 6 วัน)');
    expect(text).not.toContain('#4 ');
    expect(text).not.toContain('#6 ');
  });

  it('ends with the app link', () => {
    expect(msgs[msgs.length - 1]).toContain('https://nuchanarts.github.io/Change-Request-Tracker/');
  });

  it('caps long lists and splits into LINE-sized messages at developer boundaries', () => {
    const many = [];
    for (let i = 1; i <= 400; i++)
      many.push(mk(i, { dueDate: '1/11/2026', developer: 'คน' + (i % 40), detail: 'ก'.repeat(120) }));
    const out = D.buildDigest(many, today, {});
    expect(out.length).toBeGreaterThan(1);
    out.forEach((m) => expect(m.length).toBeLessThanOrEqual(D.DIGEST_MAX_CHARS));
    expect(out.join('\n')).toContain('และอีก 5 งาน'); // 10 each, 5 shown
    expect(out.join('\n')).not.toContain('ก'.repeat(60)); // details are shortened
  });

  it('says so when there is nothing open', () => {
    expect(D.buildDigest([], today, {})[0]).toContain('ไม่มีงานค้าง');
  });
});
