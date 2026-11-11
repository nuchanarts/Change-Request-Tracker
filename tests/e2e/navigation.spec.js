import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// Regression for the production bug "menus do nothing" (2026-11-11): inside the Apps Script iframe,
// navigation must not depend on the iframe's own location/hashchange.
test.describe('Navigation inside the Apps Script sandbox', () => {
  test('every menu item opens its screen and is pushed to google.script.history', async ({ page }) => {
    await open(page, '/?gas=1');
    const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
    const visit = async (name, check) => {
      if (test.info().project.name === 'mobile-375')
        await nav.getByRole('link', { name }).scrollIntoViewIfNeeded();
      await nav.getByRole('link', { name }).click();
      await expect(check).toBeVisible();
    };
    await visit('บอร์ดงาน', page.getByRole('heading', { name: 'บอร์ดงาน', level: 1 }));
    await visit('งานของฉัน', page.getByRole('heading', { name: 'งานของฉัน', level: 1 }));
    await visit('รายการทั้งหมด', page.getByRole('heading', { name: 'รายการทั้งหมด', level: 1 }));
    await visit('เพิ่มรายการ', page.getByRole('heading', { name: 'เพิ่มรายการขอแก้ไขใหม่' }));
    await visit('วิธีใช้งาน', page.getByRole('heading', { name: 'วิธีใช้งาน', level: 1 }));
    await visit('ภาพรวม', page.getByRole('heading', { name: 'ภาพรวมงานขอแก้ไขโปรแกรม' }));
    const pushed = await page.evaluate(() => window.__gasHistory);
    expect(pushed).toEqual(['/kanban', '/my-work', '/items', '/new', '/help', '/monitor']);
    expect(await page.evaluate(() => window.__leftIframe)).toBe(false);
    await expect(nav.getByRole('link', { name: 'ภาพรวม' })).toHaveAttribute('aria-current', 'page');
  });

  test('item links, drill-down and the back button work', async ({ page }) => {
    await open(page, '/?gas=1');
    await page.locator('[data-metric="overdue"] button').click();
    await expect(page.locator('.drill')).toBeVisible();
    await page.locator('tbody tr').first().locator('.detail-cell a').click();
    await expect(page.locator('#item-form')).toBeVisible();
    await page.evaluate(() => window.__gasBack('/items'));
    await expect(page.locator('.drill')).toBeVisible();
  });

  test('a deep link from the outer URL opens that screen', async ({ page }) => {
    await open(page, '/?gas=1&hash=/kanban');
    await expect(page.getByRole('heading', { name: 'บอร์ดงาน', level: 1 })).toBeVisible();
  });
});
