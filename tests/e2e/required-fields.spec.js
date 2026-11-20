import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "ตรงที่ * ต้องใส่ อยากให้เด่น แตกต่างชัดกว่าช่องอื่น" (user, 2026-11-20)
test('required fields look different from optional ones', async ({ page }) => {
  await open(page, '/#/new');
  const req = page.locator('.form .field-required');
  expect(await req.count()).toBeGreaterThanOrEqual(7);
  await expect(
    page.locator('#f-system').locator('xpath=ancestor::div[contains(@class,"field")][1]'),
  ).toHaveClass(/field-required/);
  await expect(req.first().locator('.req')).toContainText('จำเป็น');
  const css = await page.evaluate(() => {
    const field = (id) => document.getElementById(id).closest('.field');
    const optional = Array.from(document.querySelectorAll('.form .field')).find(
      (f) => !f.classList.contains('field-required') && f.querySelector('input,select'),
    );
    const r = field('f-system');
    const ctl = (f) => f.querySelector('input,select,textarea');
    const cs = (el) => getComputedStyle(el);
    return {
      reqWeight: +cs(r.querySelector('label')).fontWeight,
      optWeight: +cs(optional.querySelector('label')).fontWeight,
      reqBorderLeft: parseFloat(cs(ctl(r)).borderLeftWidth),
      optBorderLeft: parseFloat(cs(ctl(optional)).borderLeftWidth),
      reqBg: cs(ctl(r)).backgroundColor,
      optBg: cs(ctl(optional)).backgroundColor,
    };
  });
  expect(css.reqWeight).toBeGreaterThan(css.optWeight);
  expect(css.reqBorderLeft).toBeGreaterThan(css.optBorderLeft);
  // still empty → tinted so it is easy to see what is left to fill in
  expect(css.reqBg).not.toBe(css.optBg);
  // once filled the tint goes away
  await page.fill('#f-system', 'OPD');
  const filledBg = await page.evaluate(
    () => getComputedStyle(document.getElementById('f-system')).backgroundColor,
  );
  expect(filledBg).toBe(css.optBg);
});
