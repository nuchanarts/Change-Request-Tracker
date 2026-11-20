import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "ฉันไม่ใช่กิ่ง" (user, 2026-11-18): looking at someone's work must not change who I am.
// "ชื่อของฉัน ทำไมให้เลือกเองได้" (user, 2026-11-20): who I am comes from the admin's team list only.
const setCalls = (page) => page.evaluate(() => window.__setMyNameCalls || []);

test('the account menu shows my name from the admin and has no picker', async ({ page }) => {
  await page.addInitScript(() => (window.__mockUserName = 'นักพัฒนา แดง'));
  await open(page, '/#/monitor');
  await page.locator('#user-menu summary').click();
  await expect(page.locator('#my-name-text')).toHaveText('นักพัฒนา แดง');
  await expect(page.locator('#user-menu select')).toHaveCount(0);
  await expect(page.locator('#my-name-note')).toContainText('จัดการสิทธิ์');
  expect(await setCalls(page)).toEqual([]);
});

test('a name typed into this browser earlier no longer counts', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ehp.myname.v1', JSON.stringify('พีเอ็ม สมใจ')));
  await open(page, '/#/monitor');
  await expect(page.locator('.hero-hello')).not.toContainText('พีเอ็ม สมใจ');
  await page.locator('#user-menu summary').click();
  await expect(page.locator('#my-name-text')).toHaveText('ยังไม่ได้ตั้งชื่อ');
});

test('choosing another developer in "ดูงานของ" only changes the view', async ({ page }) => {
  await page.addInitScript(() => (window.__mockUserName = 'นักพัฒนา แดง'));
  await open(page, '/#/my-work');
  await page.selectOption('#mw-who', 'นักพัฒนา ฟ้า');
  await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา ฟ้า');
  await page.locator('#user-menu summary').click();
  await expect(page.locator('#my-name-text')).toHaveText('นักพัฒนา แดง');
  expect(await setCalls(page)).toEqual([]);
});

test('the chosen view is remembered after reload', async ({ page }) => {
  await page.addInitScript(() => (window.__mockUserName = 'นักพัฒนา แดง'));
  await open(page, '/#/my-work');
  await page.selectOption('#mw-who', 'นักพัฒนา ฟ้า');
  await page.reload();
  await expect(page.locator('.loading')).toHaveCount(0);
  await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา ฟ้า');
});
