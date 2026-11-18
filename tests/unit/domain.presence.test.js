import { describe, it, expect } from 'vitest';
import { loadDomain } from '../helpers.js';

// Presence: who is online and what they are doing (2026-11-18).
const D = loadDomain();
const P = D.presence;
const T0 = 1_000_000;

describe('presence.touch', () => {
  it('touch adds entry with at', () => {
    const m = P.touch({}, 'a@x', { name: 'เอ', view: 'monitor', seq: null }, T0);
    expect(m['a@x']).toEqual({ name: 'เอ', view: 'monitor', seq: null, at: T0 });
  });

  it('touch replaces the same email', () => {
    let m = P.touch({}, 'a@x', { name: 'เอ', view: 'monitor', seq: null }, T0);
    m = P.touch(m, 'a@x', { name: 'เอ', view: 'edit', seq: 5 }, T0 + 1000);
    expect(Object.keys(m)).toEqual(['a@x']);
    expect(m['a@x']).toMatchObject({ view: 'edit', seq: 5, at: T0 + 1000 });
  });

  it('touch prunes entries older than 180000 ms', () => {
    const old = { 'b@x': { name: 'บี', view: 'items', seq: null, at: T0 } };
    const m = P.touch(old, 'a@x', { name: 'เอ', view: 'monitor', seq: null }, T0 + 180001);
    expect(Object.keys(m)).toEqual(['a@x']);
  });

  it('touch does not mutate input', () => {
    const src = { 'b@x': { name: 'บี', view: 'items', seq: null, at: T0 } };
    const copy = JSON.parse(JSON.stringify(src));
    P.touch(src, 'a@x', { name: 'เอ', view: 'monitor', seq: null }, T0);
    expect(src).toEqual(copy);
  });
});

describe('presence.active', () => {
  const map = {
    'z@x': { name: 'ส้ม', view: 'kanban', seq: null, at: T0 },
    'b@x': { name: 'บี', view: 'items', seq: null, at: T0 - 200000 },
    'k@x': { name: 'กบ', view: 'monitor', seq: null, at: T0 - 180000 },
  };

  it('active drops stale and sorts by name', () => {
    const list = P.active(map, T0);
    expect(list.map((e) => e.email)).toEqual(['k@x', 'z@x']);
    expect(list[0]).toEqual({ email: 'k@x', name: 'กบ', view: 'monitor', seq: null, at: T0 - 180000 });
  });

  it('active keeps entry exactly at 180000 ms', () => {
    expect(P.active(map, T0).some((e) => e.email === 'k@x')).toBe(true);
  });

  it('active tolerates a null map', () => {
    expect(P.active(null, T0)).toEqual([]);
  });
});

describe('presence.editorsOf', () => {
  const map = {
    'me@x': { name: 'ฉัน', view: 'edit', seq: 7, at: T0 },
    'a@x': { name: 'เอ', view: 'edit', seq: 7, at: T0 },
    'b@x': { name: 'บี', view: 'edit', seq: 8, at: T0 },
    'c@x': { name: 'ซี', view: 'items', seq: 7, at: T0 },
    'd@x': { name: 'ดี', view: 'edit', seq: 7, at: T0 - 300000 },
  };

  it('editorsOf returns names editing seq', () => {
    expect(P.editorsOf(map, 7, 'zz@x', T0)).toEqual(['ฉัน', 'เอ']);
  });

  it('editorsOf excludes self', () => {
    expect(P.editorsOf(map, 7, 'me@x', T0)).toEqual(['เอ']);
  });

  it('editorsOf ignores other views/seqs', () => {
    expect(P.editorsOf(map, 8, 'me@x', T0)).toEqual(['บี']);
    expect(P.editorsOf(map, 99, 'me@x', T0)).toEqual([]);
  });

  it('TTL_MS is 3 minutes', () => {
    expect(P.TTL_MS).toBe(180000);
  });
});
