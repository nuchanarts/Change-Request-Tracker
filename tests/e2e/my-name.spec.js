import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "ฉันไม่ใช่กิ่ง" (user, 2026-11-18): looking at someone's work in งานของฉัน must not change who I am.
// Who I am is set in one place only: ชื่อของฉัน in the account menu.
const myName = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ehp.myname.v1')));
const setCalls = (page) => page.evaluate(() => window.__setMyNameCalls || []);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('ehp.myname.v1', JSON.stringify('นักพัฒนา แดง'));
      sessionStorage.setItem('seeded', '1');
    }
  });
});

test('choosing another developer in "ดูงานของ" does not change my name', async ({ page }) => {
  await open(page, '/#/my-work');
  await page.selectOption('#mw-who', 'นักพัฒนา ฟ้า');
  await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา ฟ้า');
  expect(await myName(page)).toBe('นักพัฒนา แดง');
  expect(await setCalls(page)).toEqual([]);
});

test('the name picker on first visit only chooses whose work to view', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('ehp.myname.v1'));
  await open(page, '/#/my-work');
  await page.locator('.mw-name', { hasText: 'นักพัฒนา ฟ้า' }).click();
  await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา ฟ้า');
  expect(await setCalls(page)).toEqual([]);
});

test('the chosen view is remembered after reload', async ({ page }) => {
  await open(page, '/#/my-work');
  await page.selectOption('#mw-who', 'นักพัฒนา ฟ้า');
  await page.reload();
  await expect(page.locator('.loading')).toHaveCount(0);
  await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา ฟ้า');
});

test('ชื่อของฉัน in the account menu sets who I am', async ({ page }) => {
  await open(page, '/#/monitor');
  await page.locator('#user-menu summary').click();
  const pick = page.getByLabel('ชื่อของฉัน');
  await expect(pick).toHaveValue('นักพัฒนา แดง');
  await pick.selectOption('นักพัฒนา ฟ้า');
  await expect.poll(() => setCalls(page)).toEqual(['นักพัฒนา ฟ้า']);
  expect(await myName(page)).toBe('นักพัฒนา ฟ้า');
});
