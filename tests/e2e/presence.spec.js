import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// Who is online and what they are doing (design 2026-11-18). The mock returns me + 2 fake teammates.
test.describe('presence', () => {
  test('badge shows "3 คนออนไลน์" and the list shows names + Thai activity', async ({ page }) => {
    await open(page, '/#/monitor');
    const badge = page.locator('#presence-count');
    await expect(badge).toContainText('3 คนออนไลน์');
    await badge.click();
    const list = page.locator('#presence-list');
    await expect(list).toBeVisible();
    await expect(list.locator('li')).toHaveCount(3);
    await expect(list).toContainText('นักพัฒนา แดง');
    await expect(list).toContainText('บอร์ดงาน');
    await expect(list).toContainText('(คุณ)');
    await expect(list).toContainText('หน้าหลัก');
  });

  test('a teammate editing item 1 shows "<name> กำลังแก้รายการนี้อยู่" and the list says กำลังแก้ #1', async ({
    page,
  }) => {
    await open(page, '/?presence=editing#/items/1');
    await expect(page.locator('#presence-warn')).toContainText('พีเอ็ม สมใจ กำลังแก้รายการนี้อยู่');
    await page.locator('#presence-count').click();
    await expect(page.locator('#presence-list')).toContainText('กำลังแก้ #1');
  });

  test('no warning on an item nobody else edits', async ({ page }) => {
    await open(page, '/?presence=editing#/items/2');
    await expect(page.locator('#f-detail')).toBeVisible();
    await expect(page.locator('#presence-warn')).toBeEmpty();
  });

  test('the heartbeat does not wipe what I am typing in the form', async ({ page }) => {
    await page.clock.install();
    await open(page, '/?presence=editing#/items/1');
    await page.fill('#f-detail', 'กำลังพิมพ์อยู่');
    await page.clock.fastForward(61000);
    await expect.poll(() => page.evaluate(() => window.__heartbeats)).toBeGreaterThan(1);
    await expect(page.locator('#f-detail')).toHaveValue('กำลังพิมพ์อยู่');
  });

  test('sends a heartbeat every 60 s, and a hidden tab sends none', async ({ page }) => {
    await page.clock.install();
    await open(page, '/#/monitor');
    await expect.poll(() => page.evaluate(() => window.__heartbeats)).toBe(1);
    await page.clock.fastForward(60000);
    await expect.poll(() => page.evaluate(() => window.__heartbeats)).toBe(2);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(120000);
    expect(await page.evaluate(() => window.__heartbeats)).toBe(2);
  });

  test('badge fits at 375px without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await open(page, '/#/monitor');
    await expect(page.locator('#presence-count')).toBeVisible();
    await page.locator('#presence-count').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('help page explains the online badge', async ({ page }) => {
  await open(page, '/#/help');
  await expect(page.getByRole('heading', { name: 'ดูว่าใครออนไลน์' })).toBeVisible();
});

test('the badge is announced with its count', async ({ page }) => {
  await open(page, '/#/monitor');
  await expect(page.locator('#presence-count')).toHaveAccessibleName(/3 คนออนไลน์/);
});

test('the edit warning is not rewritten (re-announced) when nothing changed', async ({ page }) => {
  await page.clock.install();
  await open(page, '/?presence=editing#/items/1');
  await expect(page.locator('#presence-warn')).toContainText('กำลังแก้รายการนี้อยู่');
  await page.evaluate(() => {
    window.__warnWrites = 0;
    new MutationObserver(() => window.__warnWrites++).observe(document.getElementById('presence-warn'), {
      childList: true,
      subtree: true,
    });
  });
  const before = await page.evaluate(() => window.__heartbeats);
  await page.clock.fastForward(61000);
  await expect.poll(() => page.evaluate(() => window.__heartbeats)).toBeGreaterThan(before);
  expect(await page.evaluate(() => window.__warnWrites)).toBe(0);
});
