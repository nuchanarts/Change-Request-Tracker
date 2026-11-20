import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "หน้าหลัก อยากให้มี มาสคอต เด็กผู้หญิงกับผู้ชาย กำลังพิมพ์คอม และกำลังทดสอบโปรแกรม" + "มีแมวส้มวิ่งเล่นตลอดเวลา"
// (user, 2026-11-20)
test('หน้าหลัก shows the mascots and a running orange cat', async ({ page }) => {
  await open(page);
  const art = page.locator('.hero-art .mascots');
  await expect(art).toBeVisible();
  await expect(art).toHaveAttribute('aria-label', /พิมพ์โค้ด.*ทดสอบโปรแกรม.*แมวส้ม/);
  const running = await page
    .locator('.mascots .m-cat-run')
    .evaluate((el) => getComputedStyle(el).animationIterationCount);
  expect(running).toBe('infinite');
});

test('with reduced motion the cat sits still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  const name = await page.locator('.mascots .m-cat-run').evaluate((el) => getComputedStyle(el).animationName);
  expect(name).toBe('none');
});
