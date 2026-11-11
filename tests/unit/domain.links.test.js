import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "ข้อมูลลิงค์ Taiga หรือ MANTIS ... ใน google sheet มีการใส่ลิงค์ในข้อความด้วย อยากให้ดึงมาด้วย" (2026-11-11)
const D = loadDomain();
const today = d(2026, 11, 11);

describe('collectLinks', () => {
  it('keeps http(s) links in order, without duplicates', () => {
    expect(
      D.collectLinks(
        [
          'https://taiga.hosxp.net/project/x/us/2132',
          null,
          '',
          'https://taiga.hosxp.net/project/x/us/2132',
          'http://mantis/view.php?id=9',
        ],
        '',
      ),
    ).toEqual(['https://taiga.hosxp.net/project/x/us/2132', 'http://mantis/view.php?id=9']);
  });
  it('reads =HYPERLINK("url", "label") formulas (both separators)', () => {
    expect(D.collectLinks([], '=HYPERLINK("https://taiga.hosxp.net/us/1","1")')).toEqual([
      'https://taiga.hosxp.net/us/1',
    ]);
    expect(D.collectLinks([], '=hyperlink("https://m.x/view.php?id=2";"2")')).toEqual([
      'https://m.x/view.php?id=2',
    ]);
  });
  it('drops anything that is not http(s) (javascript:, mailto:, sheet anchors)', () => {
    expect(D.collectLinks(['javascript:alert(1)', 'mailto:a@b.c', '#gid=0', ' https://ok.x/a '], '')).toEqual(
      ['https://ok.x/a'],
    );
  });
});

describe('enrich uses links embedded in the cell', () => {
  const mk = (o) => D.enrich({ rowNumber: 2, seq: '1', detail: 'x', status: 'กำลังพัฒนา', ...o }, today);
  it('a number with an embedded link becomes a clickable Taiga link', () => {
    const r = mk({ ticket: '2132', ticketLinks: ['https://taiga.hosxp.net/project/ehp/us/2132'] });
    expect(r.ticketUrl).toBe('https://taiga.hosxp.net/project/ehp/us/2132');
    expect(r.ticketLinks).toHaveLength(1);
    expect(D.itemRef(r)).toBe('2132');
  });
  it('falls back to a URL typed as text, then to nothing', () => {
    expect(mk({ ticket: 'ดู https://taiga.x/us/5 ครับ' }).ticketUrl).toBe('https://taiga.x/us/5');
    expect(mk({ ticket: '2132' }).ticketUrl).toBe(null);
    expect(mk({ ticket: '2132' }).ticketLinks).toEqual([]);
  });
  it('ignores unsafe embedded links', () => {
    expect(mk({ ticket: '1', ticketLinks: ['javascript:alert(1)'] }).ticketUrl).toBe(null);
  });
});
