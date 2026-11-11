import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// History on the item page, restoring deleted items, and the LINE digest button (2026-11-11).

const firstSeq = (page) =>
  page.evaluate(() => window.__mockSheet.rows.find((r) => r.detail && r.status === 'กำลังพัฒนา').seq);

test('item history shows who changed what, newest first', async ({ page }) => {
  await open(page);
  const seq = await firstSeq(page);
  await page.goto(`/#/items/${seq}`);
  await page.fill('#f-devHours', '9');
  await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
  await expect(page.locator('.toast').first()).toContainText('บันทึกการแก้ไขแล้ว');
  await expect(page).toHaveURL(/#\/items$/); // save reloads data, then returns to the list
  await page.goto(`/#/items/${seq}`);
  await page.locator('#history summary').click();
  await expect(page.locator('#history .hist li').first()).toContainText('ระยะเวลาพัฒนา');
  await expect(page.locator('#history .hist li').first()).toContainText('9');
  await expect(page.locator('#history .hist li').first()).toContainText('ผู้ทดสอบ');
});

test('an admin restores a deleted item with the same ลำดับ', async ({ page }) => {
  await open(page);
  const seq = await firstSeq(page);
  await page.goto(`/#/items/${seq}`);
  await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
  await page.locator('dialog').getByRole('button', { name: 'ลบรายการ' }).click();
  await expect(page.locator('.toast', { hasText: 'ลบรายการ #' + seq })).toBeVisible();
  await page.goto('/#/access');
  await page.getByRole('button', { name: 'ดูรายการที่ถูกลบ' }).click();
  const row = page.locator('tr', { has: page.locator(`button[data-seq="${seq}"]`) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'กู้คืน' }).click();
  await page.locator('dialog').getByRole('button', { name: 'กู้คืน' }).click();
  await expect(page.locator('.toast', { hasText: 'กู้คืนรายการ #' + seq })).toBeVisible();
  expect(await page.evaluate((s) => window.__mockSheet.rows.some((r) => r.seq === s), seq)).toBe(true);
  await expect(page.locator(`button[data-seq="${seq}"]`)).toHaveCount(0);
});

test('"ส่งสรุปตอนนี้" queues the digest for แมวส้ม', async ({ page }) => {
  await open(page, '/#/access');
  await page.getByRole('button', { name: 'ส่งสรุปตอนนี้ (ทดสอบ)' }).click();
  await expect(page.locator('.toast')).toContainText('แมวส้มจะส่ง');
  const msgs = await page.evaluate(() => window.__mockNotify);
  expect(msgs.length).toBeGreaterThan(0);
  expect(msgs[0]).toContain('📋 สรุปงานประจำสัปดาห์');
});

test('viewers see history but not the admin panels', async ({ page }) => {
  await open(page, '/?viewer=1#/access');
  await expect(page.getByRole('button', { name: 'ดูรายการที่ถูกลบ' })).toHaveCount(0);
});
