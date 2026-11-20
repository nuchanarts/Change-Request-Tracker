import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "ปรับปรุงหน้าแอปให้ไวขึ้น" (user, 2026-11-20): the second visit shows the last data at once,
// then swaps in fresh data from the server. Nothing can be saved from the old copy.
test('second visit shows the remembered data before the server answers', async ({ page }) => {
  await open(page, '/');
  await expect(page.locator('body')).not.toHaveAttribute('data-stale', '1');
  const fresh = await page.locator('[data-metric="open"] .value').textContent();

  await page.goto('/?latency=3000&snapshot=1');
  // well before the 3 s server answer: numbers are already on screen, marked as updating
  await expect(page.locator('[data-metric="open"] .value')).toHaveText(fresh, { timeout: 1500 });
  await expect(page.locator('body')).toHaveAttribute('data-stale', '1');
  await expect(page.locator('#sync-pill')).toContainText('กำลังอัปเดต');
  await expect(page.locator('.loading')).toHaveCount(0);

  // saving from the remembered copy is refused politely
  const res = await page.evaluate(() => window.__appApi('Api_updateRequest', {}));
  expect(res.code).toBe('STALE');

  // then the fresh data arrives
  await expect(page.locator('body')).not.toHaveAttribute('data-stale', '1', { timeout: 6000 });
  await expect(page.locator('#sync-pill')).toBeHidden();
});

test('a refused bootstrap clears the remembered data (shared computer, lost access)', async ({ page }) => {
  await open(page, '/');
  await page.goto('/?fail=bootstrap&snapshot=1');
  await expect(page.getByText('บัญชีนี้ไม่มีสิทธิ์เปิดชีตข้อมูล')).toBeVisible();
  await expect(page.locator('[data-metric="open"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ehp.snapshot.v1'))).toBeNull();
});

test('a copy saved by another Google account is never shown', async ({ page }) => {
  await open(page, '/');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ehp.snapshot.v1'));
    s.owner = 'someone-else@example.com';
    localStorage.setItem('ehp.snapshot.v1', JSON.stringify(s));
  });
  await page.goto('/?latency=2000&snapshot=1');
  await expect(page.locator('.loading')).toBeVisible();
  await expect(page.locator('body')).not.toHaveAttribute('data-stale', '1');
});
