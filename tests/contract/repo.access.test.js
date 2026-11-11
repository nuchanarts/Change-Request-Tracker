// In-app access management (user request 2026-11-11): request access, admins allow/add/suspend in _app_allowed.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const A = Config.ACCESS;
const R = Config.ROLE;
let ss, allowed, repo, effective;

function build(rows, header = Config.ALLOWED_HEADERS) {
  const main = new FakeSheet(Config.SHEETS.main, [Domain.COLUMNS.map((c) => c.header)]);
  main.rangeCanEdit = true;
  allowed = new FakeSheet(Config.SHEETS.allowed, [header.slice(), ...rows]);
  ss = new FakeSpreadsheet([main, allowed], { editors: [], probeAllowed: true });
  repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    userCache: new FakeCache(),
    effectiveEmail: () => effective,
    nowText: () => '11/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
}
const log = () => ss.getSheetByName(Config.SHEETS.log).cells.slice(1);

describe('migration of the old 3-column list', () => {
  it('adds บทบาท/สถานะ columns; existing members become active admins', () => {
    build(
      [
        ['me@gmail.com', '', ''],
        ['owner@gmail.com', '', ''],
      ],
      ['email', 'ชื่อ', 'หมายเหตุ'],
    );
    const list = repo.listAccess();
    expect(allowed.cells[0]).toEqual(Config.ALLOWED_HEADERS);
    expect(list.map((m) => [m.email, m.role, m.status])).toEqual([
      ['me@gmail.com', R.admin, A.allowed],
      ['owner@gmail.com', R.admin, A.allowed],
    ]);
  });
});

describe('who is admin / who can edit', () => {
  it('admins by role; the sheet owner is always admin; pending/suspended members cannot edit', () => {
    build([
      ['boss@x.com', '', '', R.admin, A.allowed],
      ['dev@x.com', '', '', R.editor, A.allowed],
      ['new@x.com', '', '', R.editor, A.pending],
      ['gone@x.com', '', '', R.editor, A.suspended],
    ]);
    expect(repo.isAdmin('boss@x.com', 'owner@x.com')).toBe(true);
    expect(repo.isAdmin('dev@x.com', 'owner@x.com')).toBe(false);
    expect(repo.isAdmin('owner@x.com', 'owner@x.com')).toBe(true);
    effective = 'dev@x.com';
    expect(repo.editAccess('dev@x.com', 'owner@x.com').canEdit).toBe(true);
    effective = 'new@x.com';
    expect(repo.editAccess('new@x.com', 'owner@x.com')).toEqual({ canEdit: false, reason: 'PENDING' });
    effective = 'gone@x.com';
    expect(repo.editAccess('gone@x.com', 'owner@x.com')).toEqual({ canEdit: false, reason: 'NOT_ALLOWED' });
  });
});

describe('requestAccess', () => {
  it('adds a pending editor once and logs it', () => {
    build([['boss@x.com', '', '', R.admin, A.allowed]]);
    expect(repo.requestAccess('New@X.com', 'สมชาย', 'ทีมทดสอบ')).toEqual({
      ok: true,
      data: { status: A.pending },
    });
    expect(repo.requestAccess('new@x.com', 'สมชาย', '')).toEqual({ ok: true, data: { status: A.pending } });
    expect(allowed.cells.slice(1).map((r) => r[0])).toEqual(['boss@x.com', 'new@x.com']);
    expect(allowed.cells[2].slice(1)).toEqual(['สมชาย', 'ทีมทดสอบ', R.editor, A.pending]);
    expect(log().pop().slice(1, 3)).toEqual(['new@x.com', 'ACCESS_REQUEST']);
  });

  it('returns the current status for people already on the list', () => {
    build([['dev@x.com', '', '', R.editor, A.allowed]]);
    expect(repo.requestAccess('dev@x.com', '', '').data.status).toBe(A.allowed);
  });
});

describe('saveAccess (admins only)', () => {
  it('admins can allow a pending request, add new people and change roles; everything is logged', () => {
    build([
      ['boss@x.com', '', '', R.admin, A.allowed],
      ['new@x.com', 'สมชาย', '', R.editor, A.pending],
    ]);
    expect(repo.saveAccess('boss@x.com', '', { email: 'new@x.com', status: A.allowed }).ok).toBe(true);
    expect(repo.saveAccess('boss@x.com', '', { email: 'pm2@x.com', name: 'PM สอง', role: R.admin }).ok).toBe(
      true,
    );
    const list = repo.listAccess();
    expect(list.find((m) => m.email === 'new@x.com').status).toBe(A.allowed);
    expect(list.find((m) => m.email === 'pm2@x.com')).toMatchObject({
      role: R.admin,
      status: A.allowed,
      name: 'PM สอง',
    });
    expect(log().map((r) => r[2])).toEqual(['ACCESS_UPDATE', 'ACCESS_ADD']);
  });

  it('non-admins are refused', () => {
    build([['dev@x.com', '', '', R.editor, A.allowed]]);
    expect(repo.saveAccess('dev@x.com', '', { email: 'x@x.com' })).toMatchObject({
      ok: false,
      code: 'NOT_ADMIN',
    });
  });

  it('rejects invalid emails, roles and statuses', () => {
    build([['boss@x.com', '', '', R.admin, A.allowed]]);
    expect(repo.saveAccess('boss@x.com', '', { email: 'not-an-email' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(repo.saveAccess('boss@x.com', '', { email: 'a@x.com', role: 'god' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
    expect(repo.saveAccess('boss@x.com', '', { email: 'a@x.com', status: 'x' })).toMatchObject({
      ok: false,
      code: 'VALIDATION',
    });
  });

  it('never leaves zero active admins (sheet owner counts)', () => {
    build([['boss@x.com', '', '', R.admin, A.allowed]]);
    expect(repo.saveAccess('boss@x.com', '', { email: 'boss@x.com', status: A.suspended })).toMatchObject({
      ok: false,
      code: 'LAST_ADMIN',
    });
    expect(repo.saveAccess('boss@x.com', '', { email: 'boss@x.com', role: R.editor })).toMatchObject({
      ok: false,
      code: 'LAST_ADMIN',
    });
    // with the owner as a fallback admin, demoting is fine
    expect(repo.saveAccess('boss@x.com', 'owner@x.com', { email: 'boss@x.com', role: R.editor }).ok).toBe(
      true,
    );
  });

  it('never deletes rows: suspending keeps the row', () => {
    build([
      ['boss@x.com', '', '', R.admin, A.allowed],
      ['dev@x.com', '', '', R.editor, A.allowed],
    ]);
    repo.saveAccess('boss@x.com', '', { email: 'dev@x.com', status: A.suspended });
    expect(allowed.cells.length).toBe(3);
    expect(repo.listAccess().find((m) => m.email === 'dev@x.com').status).toBe(A.suspended);
  });
});
