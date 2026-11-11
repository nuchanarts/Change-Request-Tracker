// Team allowlist (user decision 2026-11-11): everyone signs in with Gmail and can view; only emails in
// the _app_allowed sheet can add or edit. Every change is still logged in _app_log.
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const HEADERS = Domain.COLUMNS.map((c) => c.header);
let ss, main, repo, effective;

const build = ({ allowed = null, probeAllowed = true } = {}) => {
  main = new FakeSheet(Config.SHEETS.main, [HEADERS.slice()]);
  main.rangeCanEdit = false; // like the real link-shared sheet
  const sheets = [main];
  if (allowed) sheets.push(new FakeSheet(Config.SHEETS.allowed, [Config.ALLOWED_HEADERS.slice(), ...allowed]));
  ss = new FakeSpreadsheet(sheets, { editors: [], probeAllowed });
  repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    userCache: new FakeCache(),
    effectiveEmail: () => effective,
    nowText: () => '11/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
};

describe('editAccess', () => {
  beforeEach(() => {
    effective = null;
  });

  it('allows a sheet editor who is on the team list (case-insensitive)', () => {
    build({ allowed: [['Dev@Hospital.org', 'Dev', '']] });
    effective = 'dev@hospital.org';
    expect(repo.editAccess('dev@hospital.org', 'owner@x.com')).toEqual({ canEdit: true, reason: 'OK' });
  });

  it('blocks a sheet editor who is not on the team list', () => {
    build({ allowed: [['someone@x.com', '', '']] });
    effective = 'outsider@gmail.com';
    expect(repo.editAccess('outsider@gmail.com', 'owner@x.com')).toEqual({ canEdit: false, reason: 'NOT_ALLOWED' });
  });

  it('blocks people who cannot edit the sheet at all, even if listed', () => {
    build({ allowed: [['viewer@x.com', '', '']], probeAllowed: false });
    effective = 'viewer@x.com';
    expect(repo.editAccess('viewer@x.com', 'owner@x.com')).toEqual({ canEdit: false, reason: 'SHEET_VIEW_ONLY' });
  });

  it('first sheet editor creates the list with the owner and themselves, and it is logged', () => {
    build();
    effective = 'first@gmail.com';
    expect(repo.editAccess('first@gmail.com', 'Owner@Gmail.com')).toEqual({ canEdit: true, reason: 'OK' });
    const sheet = ss.getSheetByName(Config.SHEETS.allowed);
    expect(sheet.cells[0]).toEqual(Config.ALLOWED_HEADERS);
    expect(sheet.cells.slice(1).map((r) => r[0])).toEqual(['owner@gmail.com', 'first@gmail.com']);
    expect(sheet.hidden).toBe(false); // the PM must see and manage it
    const log = ss.getSheetByName(Config.SHEETS.log).cells;
    expect(log[log.length - 1].slice(2, 3)).toEqual(['ALLOW_INIT']);
  });

  it('ignores blank rows and stray spaces in the list', () => {
    build({ allowed: [['', '', ''], ['  pm@x.com  ', 'PM', '']] });
    effective = 'pm@x.com';
    expect(repo.editAccess('pm@x.com', '').canEdit).toBe(true);
  });
});
