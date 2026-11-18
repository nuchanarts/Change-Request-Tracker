import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// ผู้ทดสอบ field (user request 2026-11-18): pick from the list or type a new name; hidden if the sheet lacks the column.
test.describe('ผู้ทดสอบ field', () => {
  test('edit form shows ผู้ทดสอบ next to นักพัฒนา and saves a typed name', async ({ page }) => {
    await open(page, '/#/items/1');
    const field = page.locator('#f-tester');
    await expect(field).toBeVisible();
    await expect(page.locator('label[for="f-tester"]')).toContainText('ผู้ทดสอบ');
    await field.fill('คนทดสอบใหม่');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.locator('.toast')).toBeVisible();
    const saved = await page.evaluate(() => window.__mockSheet.rows.find((r) => r.seq === '1').tester);
    expect(saved).toBe('คนทดสอบใหม่');
  });

  test('field is hidden when the sheet has no ผู้ทดสอบ column', async ({ page }) => {
    await open(page, '/?notester=1#/items/1');
    await expect(page.locator('#f-developer')).toBeVisible();
    await expect(page.locator('#f-tester')).toHaveCount(0);
  });
});
