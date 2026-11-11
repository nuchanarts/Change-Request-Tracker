import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test('users not on the team list can view but see how to get edit access', async ({ page }) => {
  await open(page, '/?notallowed=1');
  await expect(page.locator('.banner.warn')).toContainText('ยังไม่อยู่ในรายชื่อทีม');
  await expect(page.locator('.banner.warn')).toContainText('_app_allowed');
  await expect(page.locator('#nav-add')).toBeHidden();
  await page.goto('/?notallowed=1#/kanban');
  await expect(page.locator('.kmove')).toHaveCount(0);
});

test('sheet view-only users get the sheet message', async ({ page }) => {
  await open(page, '/?viewer=1');
  await expect(page.locator('.banner.warn')).toContainText('สิทธิ์ดูอย่างเดียวในชีต');
});
