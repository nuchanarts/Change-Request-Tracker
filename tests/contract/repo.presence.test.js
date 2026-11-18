import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { FakeSheet, FakeSpreadsheet, FakeLock, FakeCache } from './FakeSpreadsheet.js';

const require = createRequire(import.meta.url);
const makeRepo = require('../../src/server/Repo.js');
const Config = require('../../src/server/Config.js');

// Presence heartbeat: script cache only, never the sheet (2026-11-18).
const KEY = Config.PRESENCE.CACHE_KEY;
let ss, users, lock, cache, now, repo;

const build = () =>
  makeRepo({
    ss,
    getLock: () => lock,
    cache,
    nowMs: () => now,
    nowText: () => '18/11/2026 10:00:00',
    makeDate: (y, m, d) => new Date(y, m - 1, d),
  });

beforeEach(() => {
  users = new FakeSheet(Config.SHEETS.users, [
    ['อีเมล', 'ชื่อ', 'อัปเดต'],
    ['a@x.com', 'นุชนารถ (แก๊ส)', ''],
  ]);
  ss = new FakeSpreadsheet([users], { editors: [] });
  lock = new FakeLock();
  cache = new FakeCache();
  now = 1_000_000;
  repo = build();
});

describe('Repo.heartbeat', () => {
  it('first heartbeat stores entry and returns self', () => {
    const r = repo.heartbeat('a@x.com', 'monitor', null);
    expect(r.nowMs).toBe(now);
    expect(r.online).toEqual([{ email: 'a@x.com', name: 'นุชนารถ (แก๊ส)', view: 'monitor', seq: null }]);
    expect(JSON.parse(cache.get(KEY))['a@x.com']).toMatchObject({ view: 'monitor', at: now });
  });

  it('two users both online', () => {
    repo.heartbeat('a@x.com', 'monitor', null);
    now += 30000;
    const r = repo.heartbeat('b@x.com', 'edit', 12);
    expect(r.online.map((e) => e.email).sort()).toEqual(['a@x.com', 'b@x.com']);
    expect(r.online.find((e) => e.email === 'b@x.com')).toMatchObject({ view: 'edit', seq: 12 });
  });

  it('stale user dropped after 180001 ms', () => {
    repo.heartbeat('a@x.com', 'monitor', null);
    now += 180001;
    const r = repo.heartbeat('b@x.com', 'items', null);
    expect(r.online.map((e) => e.email)).toEqual(['b@x.com']);
  });

  it('lock busy → no write, still returns list', () => {
    repo.heartbeat('a@x.com', 'monitor', null);
    const before = cache.get(KEY);
    lock = new FakeLock({ available: false });
    const r = repo.heartbeat('b@x.com', 'items', null);
    expect(cache.get(KEY)).toBe(before);
    expect(r.online.map((e) => e.email)).toEqual(['a@x.com']);
  });

  it('bad cache JSON → starts fresh', () => {
    cache.put(KEY, '{not json');
    const r = repo.heartbeat('a@x.com', 'monitor', null);
    expect(r.online.map((e) => e.email)).toEqual(['a@x.com']);
  });

  it('name falls back to email local part', () => {
    const r = repo.heartbeat('somchai@x.com', 'monitor', null);
    expect(r.online[0].name).toBe('somchai');
  });

  it('email is matched case-insensitively and stored lower-case', () => {
    const r = repo.heartbeat('A@X.com', 'monitor', null);
    expect(r.online).toEqual([{ email: 'a@x.com', name: 'นุชนารถ (แก๊ส)', view: 'monitor', seq: null }]);
  });

  it('empty email does not write', () => {
    const r = repo.heartbeat('', 'monitor', null);
    expect(cache.get(KEY)).toBeNull();
    expect(r.online).toEqual([]);
  });

  it('does not touch any sheet', () => {
    const before = JSON.stringify(users.cells);
    repo.heartbeat('a@x.com', 'monitor', null);
    expect(ss.getSheetByName(Config.SHEETS.log)).toBeNull();
    expect(JSON.stringify(users.cells)).toBe(before);
    expect(users.writes).toEqual([]);
  });
});

describe('Repo.heartbeat name refresh (review fix 2026-11-18)', () => {
  it('a name set after the first heartbeat replaces the email fallback', () => {
    expect(repo.heartbeat('somchai@x.com', 'monitor', null).online[0].name).toBe('somchai');
    expect(repo.setUserName('somchai@x.com', 'สมชาย').ok).toBe(true);
    now += 60000;
    expect(repo.heartbeat('somchai@x.com', 'monitor', null).online[0].name).toBe('สมชาย');
  });
});
