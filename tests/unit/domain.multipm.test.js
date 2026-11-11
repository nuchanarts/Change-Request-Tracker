import { describe, it, expect } from 'vitest';
import { loadDomain, d } from '../helpers.js';

// "PM ให้เลือกได้มากกว่า 1 คน" (user, 2026-11-11): several PMs in the same cell, joined with ", "
// (the format Google Sheets multi-select dropdown chips use), so no column is added.
const D = loadDomain();
const today = d(2026, 11, 11);
const PMS = ['นุชนารถ (แก๊ส)', 'วนิดา (แพท)', 'ทิพวรรณ (พี่ส้ม)', 'กษิดิ์เดช (พี่ป้อง)'];
const options = {
  pm: PMS,
  person: ['แดง'],
  developer: ['แดง'],
  platform: ['EHP'],
  urgency: ['ปกติ'],
  issueType: ['Bug'],
  system: [],
};
const mk = (seq, o) =>
  D.enrich(
    { rowNumber: seq + 1, seq: String(seq), detail: 'x', status: 'กำลังพัฒนา', dueDate: '30/11/2026', ...o },
    today,
  );

describe('splitPm / joinPm', () => {
  it('splits on commas, trims and drops blanks; joins in PM-list order with ", "', () => {
    expect(D.splitPm('วนิดา (แพท),นุชนารถ (แก๊ส) , ')).toEqual(['วนิดา (แพท)', 'นุชนารถ (แก๊ส)']);
    expect(D.splitPm('')).toEqual([]);
    expect(D.joinPm(['วนิดา (แพท)', 'นุชนารถ (แก๊ส)'], PMS)).toBe('นุชนารถ (แก๊ส), วนิดา (แพท)');
  });
  it('enrich exposes pms[]', () => {
    expect(mk(1, { pm: 'นุชนารถ (แก๊ส), วนิดา (แพท)' }).pms).toEqual(['นุชนารถ (แก๊ส)', 'วนิดา (แพท)']);
  });
});

describe('validation accepts several PMs, each from the list', () => {
  it('ok for two listed PMs, error when any one is unknown', () => {
    const ok = D.validateUpdate(
      { pm: { from: 'วนิดา (แพท)', to: 'นุชนารถ (แก๊ส), วนิดา (แพท)' } },
      {},
      options,
    );
    expect(ok.ok).toBe(true);
    const bad = D.validateUpdate({ pm: { from: '', to: 'นุชนารถ (แก๊ส), คนนอก' } }, {}, options);
    expect(bad.errors.pm).toBeTruthy();
  });
  it('detectIssues does not flag a valid multi-PM cell', () => {
    const r = mk(1, {
      pm: 'นุชนารถ (แก๊ส), วนิดา (แพท)',
      platform: 'EHP',
      urgency: 'ปกติ',
      issueType: 'Bug',
    });
    expect(D.detectIssues(r, options, { 1: 1 }).filter((x) => x.field === 'pm')).toEqual([]);
  });
});

describe('a shared item counts for each of its PMs', () => {
  const rows = [mk(1, { pm: 'นุชนารถ (แก๊ส), วนิดา (แพท)' }), mk(2, { pm: 'วนิดา (แพท)' })];
  it('filter by one PM finds shared items', () => {
    expect(D.applyFilters(rows, { pm: ['นุชนารถ (แก๊ส)'] }).map((r) => r.id)).toEqual(['1']);
    expect(D.applyFilters(rows, { pm: ['วนิดา (แพท)'] }).map((r) => r.id)).toEqual(['1', '2']);
  });
  it('byPm counts the item under both PMs', () => {
    const by = D.computeMetrics(rows, today).byPm;
    const get = (n) => by.find((p) => p.name === n).open;
    expect([get('นุชนารถ (แก๊ส)'), get('วนิดา (แพท)')]).toEqual([1, 2]);
  });
  it('My Work for a PM includes shared items', () => {
    expect(D.groupMyWork(rows, 'นุชนารถ (แก๊ส)', 'pm', today).total).toBe(1);
  });
});
