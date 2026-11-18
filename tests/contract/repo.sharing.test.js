// Access management (user request 2026-11-18): adding a member shares the sheet with them as an editor,
// removing a member (status ระงับ, the row is kept) takes it back, and admins can share with every
// active member at once before the sheet's link is changed to view-only.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');
const Domain = require('../../src/shared/Domain.js');

const A = Config.ACCESS;
const R = Config.ROLE;
const OWNER = 'owner@x.com';

function build(rows, editors = []) {
  const main = new FakeSheet(Config.SHEETS.main, [Domain.COLUMNS.map((c) => c.header)]);
  const allowed = new FakeSheet(Config.SHEETS.allowed, [Config.ALLOWED_HEADERS.slice(), ...rows]);
  const ss = new FakeSpreadsheet([main, allowed], { editors: editors.slice() });
  const repo = makeRepo({
    ss,
    getLock: () => new FakeLock(),
    cache: new FakeCache(),
    userCache: new FakeCache(),
    effectiveEmail: () => 'boss@x.com',
    nowText: () => '18/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });
  const log = () => (ss.getSheetByName(Config.SHEETS.log) || { cells: [[]] }).cells.slice(1);
  return { ss, allowed, repo, log };
}
const boss = ['boss@x.com', 'บอส', '', R.admin, A.allowed];

describe('sharing follows team membership', () => {
  it('adding an allowed member shares the sheet as editor', () => {
    const { ss, repo } = build([boss]);
    const res = repo.saveAccess('boss@x.com', OWNER, { email: 'New@x.com', name: 'ใหม่' });
    expect(res.ok).toBe(true);
    expect(res.data.shared).toBe('added');
    expect(ss.editors).toContain('new@x.com');
  });

  it('a new member can edit right away (named editor, no probe needed)', () => {
    const { repo } = build([boss]);
    repo.saveAccess('boss@x.com', OWNER, { email: 'new@x.com' });
    expect(repo.editAccess('new@x.com', OWNER)).toEqual({ canEdit: true, reason: 'OK' });
  });

  it('removing a member (status ระงับ) keeps the row and takes the sharing back', () => {
    const { ss, repo, allowed } = build([boss, ['dev@x.com', 'เดฟ', '', R.editor, A.allowed]], ['dev@x.com']);
    const res = repo.saveAccess('boss@x.com', OWNER, { email: 'dev@x.com', status: A.suspended });
    expect(res.ok).toBe(true);
    expect(res.data.shared).toBe('removed');
    expect(ss.editors).not.toContain('dev@x.com');
    expect(allowed.cells.map((r) => r[0])).toContain('dev@x.com');
  });

  it('giving access back shares again', () => {
    const { ss, repo } = build([boss, ['dev@x.com', '', '', R.editor, A.suspended]]);
    const res = repo.saveAccess('boss@x.com', OWNER, { email: 'dev@x.com', status: A.allowed });
    expect(res.data.shared).toBe('added');
    expect(ss.editors).toContain('dev@x.com');
  });

  it('a pending request does not share; approving it does', () => {
    const { ss, repo } = build([boss, ['req@x.com', '', '', R.editor, A.pending]]);
    const res = repo.saveAccess('boss@x.com', OWNER, { email: 'req@x.com', name: 'ขอ' });
    expect(res.data.shared).toBeUndefined();
    expect(ss.editors).not.toContain('req@x.com');
    repo.saveAccess('boss@x.com', OWNER, { email: 'req@x.com', status: A.allowed });
    expect(ss.editors).toContain('req@x.com');
  });

  it('changing only the name or role does not touch sharing', () => {
    const { ss, repo } = build([boss, ['dev@x.com', '', '', R.editor, A.allowed]], ['dev@x.com']);
    const res = repo.saveAccess('boss@x.com', OWNER, { email: 'dev@x.com', name: 'ชื่อใหม่' });
    expect(res.data.shared).toBeUndefined();
    expect(res.data.name).toBe('ชื่อใหม่');
    expect(ss.editors).toEqual(['dev@x.com']);
  });

  it('never unshares the sheet owner', () => {
    const { ss, repo } = build([boss, [OWNER, '', '', R.admin, A.allowed]], [OWNER]);
    repo.saveAccess('boss@x.com', OWNER, { email: OWNER, status: A.suspended });
    expect(ss.editors).toContain(OWNER);
  });

  it('a sharing failure still saves the member and says so', () => {
    const { ss, repo } = build([boss]);
    ss.shareFails = true;
    const res = repo.saveAccess('boss@x.com', OWNER, { email: 'new@x.com' });
    expect(res.ok).toBe(true);
    expect(res.data.shared).toBe('failed');
    expect(repo.listAccess().map((m) => m.email)).toContain('new@x.com');
  });

  it('sharing changes are logged', () => {
    const { repo, log } = build([boss]);
    repo.saveAccess('boss@x.com', OWNER, { email: 'new@x.com' });
    expect(log().some((r) => r[2] === 'ACCESS_SHARE' && r[5] === 'new@x.com' && r[7] === 'ผู้แก้ไขชีต')).toBe(
      true,
    );
  });
});

describe('shareAll: share with every active member before the link becomes view-only', () => {
  it('shares with allowed members who are not named editors, skipping the owner, pending and suspended', () => {
    const { ss, repo } = build(
      [
        boss,
        ['a@x.com', '', '', R.editor, A.allowed],
        ['b@x.com', '', '', R.editor, A.allowed],
        ['p@x.com', '', '', R.editor, A.pending],
        ['s@x.com', '', '', R.editor, A.suspended],
        [OWNER, '', '', R.admin, A.allowed],
      ],
      ['b@x.com'],
    );
    const res = repo.shareAll('boss@x.com', OWNER);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ added: 2, already: 1, failed: [] });
    expect(ss.editors.slice().sort()).toEqual(['a@x.com', 'b@x.com', 'boss@x.com']);
  });

  it('is for admins only', () => {
    const { repo } = build([boss, ['dev@x.com', '', '', R.editor, A.allowed]]);
    expect(repo.shareAll('dev@x.com', OWNER)).toMatchObject({ ok: false, code: 'NOT_ADMIN' });
  });

  it('reports who could not be shared', () => {
    const { ss, repo } = build([boss]);
    ss.shareFails = true;
    expect(repo.shareAll('boss@x.com', OWNER).data).toEqual({ added: 0, already: 0, failed: ['boss@x.com'] });
  });
});
