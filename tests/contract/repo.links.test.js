// Links embedded in the Taiga/MANTIS cell (rich text or =HYPERLINK) are read too (2026-11-11).
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const HEADERS = Domain.COLUMNS.map((c) => c.header);
const col = (key) => Domain.COLUMNS.findIndex((c) => c.key === key) + 1;
const line = (seq, o = {}) => {
  const r = new Array(HEADERS.length).fill('');
  r[col('seq') - 1] = seq;
  r[col('detail') - 1] = 'งาน ' + seq;
  r[col('status') - 1] = 'กำลังพัฒนา';
  Object.entries(o).forEach(([k, v]) => (r[col(k) - 1] = v));
  return r;
};

let main, repo;
beforeEach(() => {
  main = new FakeSheet(Config.SHEETS.main, [
    HEADERS.slice(),
    line(1, { ticket: '2132' }),
    line(2, { ticket: 'Taiga 77 / MANTIS 9' }),
    line(3, { ticket: '15' }),
    line(4, { ticket: '' }),
  ]);
  main.links = {
    [`2:${col('ticket')}`]: ['https://taiga.hosxp.net/project/ehp/us/2132'],
    [`3:${col('ticket')}`]: ['https://taiga.hosxp.net/project/ehp/us/77', 'https://mantis.x/view.php?id=9'],
  };
  main.formulas = { [`4:${col('ticket')}`]: '=HYPERLINK("https://taiga.hosxp.net/project/ehp/us/15","15")' };
  const ss = new FakeSpreadsheet([main]);
  repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    nowText: () => '',
    makeDate: () => null,
  });
});

describe('readAll: links inside the Taiga/MANTIS cell', () => {
  it('returns rich-text links, several per cell, and =HYPERLINK targets', () => {
    const rows = repo.readAll().rows;
    expect(rows[0].ticket).toBe('2132');
    expect(rows[0].ticketLinks).toEqual(['https://taiga.hosxp.net/project/ehp/us/2132']);
    expect(rows[1].ticketLinks).toEqual([
      'https://taiga.hosxp.net/project/ehp/us/77',
      'https://mantis.x/view.php?id=9',
    ]);
    expect(rows[2].ticketLinks).toEqual(['https://taiga.hosxp.net/project/ehp/us/15']);
    expect(rows[3].ticketLinks).toBeUndefined();
  });

  it('reads the ticket column links in one call, not per cell', () => {
    repo.readAll();
    expect(main.richReads).toBe(1);
  });

  it('still works when the rich-text API is unavailable', () => {
    main.getRange = (
      (orig) =>
      (...a) =>
        Object.assign(orig(...a), { getRichTextValues: undefined })
    )(main.getRange.bind(main));
    expect(repo.readAll().rows[0].ticket).toBe('2132');
  });
});
