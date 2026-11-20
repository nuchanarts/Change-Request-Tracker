import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open } from './helpers.js';

// "ขอให้เปลี่ยน skin ได้" → ธีมสีของทั้งแอป (user, 2026-11-20). Remembered per browser.
const accent = (page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());

test('pick a colour theme from the account menu; it applies to the whole app and is remembered', async ({
  page,
}) => {
  await open(page);
  const before = await accent(page);
  await page.locator('#user-menu summary').click();
  const skins = page.locator('#skin-pick [data-skin]');
  await expect(skins).toHaveCount(5);
  await expect(skins.first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#skin-pick [data-skin="pink"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'pink');
  await expect(page.locator('#skin-pick [data-skin="pink"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await accent(page)).not.toBe(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'pink');
});

for (const skin of ['sky', 'pink', 'purple', 'orange']) {
  test(`theme ${skin} keeps text readable`, async ({ page }) => {
    await page.addInitScript((s) => localStorage.setItem('ehp.skin.v1', JSON.stringify(s)), skin);
    await open(page);
    const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test('the account menu stays on screen when the header wraps', async ({ page }) => {
  await open(page);
  await page.locator('#user-menu summary').click();
  const box = await page.locator('.user-pop').boundingBox();
  const vw = page.viewportSize().width;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vw);
});
