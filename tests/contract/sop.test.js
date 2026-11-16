import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { loadDomain } from '../helpers.js';

// "SOP และ Workflow ฉบับใช้งานจริง พร้อม RACI … เอาไปไว้ในแอปด้วย … อัพขึ้น github และ .io" (user, 2026-11-16)
// One SOP fragment (src/client/Sop.html) feeds both the in-app help page and docs/sop.html.
const D = loadDomain();
const sop = readFileSync('src/client/Sop.html', 'utf8');

describe('SOP fragment', () => {
  it('lists every workflow status exactly as spelled in the sheet', () => {
    for (const s of D.WORKFLOW) expect(sop, s).toContain(`<code>${s}</code>`);
  });

  it('has a RACI table with the four team roles', () => {
    expect(sop).toContain('id="sop-raci"');
    for (const role of ['PM', 'Senior Dev', 'Dev', 'Tester'])
      expect(sop).toContain(`<th scope="col">${role}</th>`);
  });

  // "ยืนยัน SOP" (user, 2026-11-16): the approved SOP carries no draft labels
  it('is the approved version, with no draft or to-be-confirmed labels', () => {
    expect(sop).not.toMatch(/ฉบับร่าง|ทีมต้องยืนยัน|sop-tbc/);
    expect(sop).toContain('ฉบับใช้งานจริง 1.0');
  });

  it('never suggests the forbidden startsWith("0.") rule', () => {
    expect(sop).not.toMatch(/startsWith/);
  });
});

describe('GitHub Pages SOP page', () => {
  it('is generated from the same fragment', () => {
    expect(existsSync('docs/sop.template.html')).toBe(true);
    expect(readFileSync('docs/sop.template.html', 'utf8')).toContain('<!-- SOP -->');
    expect(readFileSync('docs/index.template.html', 'utf8')).toContain('href="sop.html"');
  });
});
