import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "ตรงจัดการสิทธิ ให้สามารถลบ แก้ไขได้ด้วย อยากให้เพิ่มลงไปให้เค้าเข้าใช้งานได้เลย" (user, 2026-11-18)
const row = (page, email) => page.locator('.access-table tr', { hasText: email });

test('adding a member says the sheet was shared with them', async ({ page }) => {
  await open(page, '/#/access');
  await page.fill('#f-acc-email', 'friend@gmail.com');
  await page.getByRole('button', { name: 'เพิ่มเข้าทีม' }).click();
  await expect(page.locator('.toast')).toContainText('แชร์ชีตให้แล้ว');
  await expect(row(page, 'friend@gmail.com')).toBeVisible();
});

test('a member name can be edited in the table', async ({ page }) => {
  await open(page, '/#/access');
  const name = row(page, 'dev1@example.com').getByLabel('ชื่อของ dev1@example.com');
  await name.fill('นักพัฒนา แดงใหม่');
  await name.press('Enter');
  await expect(page.locator('.toast')).toContainText('dev1@example.com');
  const saved = await page.evaluate(
    () => window.__mockAccess.find((m) => m.email === 'dev1@example.com').name,
  );
  expect(saved).toBe('นักพัฒนา แดงใหม่');
});

test('remove from team moves the member to "นำออกแล้ว" and can be undone', async ({ page }) => {
  await open(page, '/#/access');
  await expect(page.locator('#am-h .count')).toHaveText('2'); // allowed members (the pending one waits above)
  await row(page, 'dev1@example.com').getByRole('button', { name: 'นำออกจากทีม' }).click();
  await expect(page.locator('.toast')).toContainText('ถอนสิทธิ์แชร์แล้ว');
  await expect(page.locator('#am-h .count')).toHaveText('1');
  const removed = page.locator('.access-removed');
  await removed.locator('summary').click(); // collapsed by default
  await expect(removed).toContainText('dev1@example.com');
  await removed.getByRole('button', { name: 'คืนสิทธิ์' }).click();
  await expect(page.locator('#am-h .count')).toHaveText('2');
  await expect(row(page, 'dev1@example.com')).toBeVisible();
});

test('share with everyone before the link is made view-only', async ({ page }) => {
  await open(page, '/#/access');
  await page.getByRole('button', { name: 'แชร์ชีตให้สมาชิกทุกคน' }).click();
  await expect(page.locator('.toast')).toContainText('แชร์เพิ่ม 1 คน');
});

test('a sharing failure is shown so the admin can share by hand', async ({ page }) => {
  await open(page, '/?sharefail=1#/access');
  await page.fill('#f-acc-email', 'friend@gmail.com');
  await page.getByRole('button', { name: 'เพิ่มเข้าทีม' }).click();
  await expect(page.locator('.toast')).toContainText('แชร์ชีตไม่สำเร็จ');
});
