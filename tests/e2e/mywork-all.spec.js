import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "งานของฉัน — อยากให้ดูได้แบบทุกคนด้วย" (user, 2026-11-18): a ทุกคน choice shows every developer's work,
// each card says whose it is, and picking ทุกคน does not change who "me" is.
const assignedOpen = (page) =>
  page.evaluate(() => {
    const D = window.Domain;
    const fx = window.__FIXTURE__;
    const rows = fx.rows.filter((r) => String(r.detail || '').trim()).map((r) => D.enrich(r, fx.today));
    return D.groupMyWeek(rows, D.ALL_DEVELOPERS, 'developer', fx.today).openTotal;
  });

test('งานของฉัน offers ทุกคน and shows every developer with names on cards', async ({ page }) => {
  await page.addInitScript(() => (window.__mockUserName = 'นักพัฒนา แดง'));
  await open(page, '/#/my-work');
  const who = page.locator('#mw-who');
  await expect(who.locator('optgroup[label="ทั้งทีม"] option')).toHaveText(['ทุกคน']);
  await who.selectOption('ทุกคน');
  await expect(who).toHaveValue('ทุกคน');
  await expect(page.locator('.page-head .muted')).toHaveText('งานของนักพัฒนาทุกคน');
  expect(await assignedOpen(page)).toBeGreaterThan(0);
  await expect(page.locator('#mw-urgent .work .dev-name').first()).toBeVisible();
  // "me" is unchanged
  await page.locator('#user-menu summary').click();
  await expect(page.locator('#my-name-text')).toHaveText('นักพัฒนา แดง');
  await page.locator('#user-menu summary').click();
  // back to one person
  await who.selectOption('นักพัฒนา แดง');
  await expect(page.locator('.page-head .muted')).toHaveText('งานที่คุณเป็นนักพัฒนา');
  await expect(page.locator('.work .dev-name')).toHaveCount(0);
});

test('ทุกคน is offered on the name picker and is remembered after reload', async ({ page }) => {
  await open(page, '/#/my-work');
  await page.locator('.mw-name', { hasText: 'ทุกคน' }).click();
  await expect(page.locator('#mw-who')).toHaveValue('ทุกคน');
  await page.reload();
  await expect(page.locator('.loading')).toHaveCount(0);
  await expect(page.locator('#mw-who')).toHaveValue('ทุกคน');
});
