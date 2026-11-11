import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

const countText = (page) => page.locator('.page-head .muted').first();
const n = (s) => Number(String(s).replace(/[^\d]/g, ''));

test.describe('US5 Search & list', () => {
  test('search by ลำดับ finds exactly that item', async ({ page }) => {
    await open(page, '/#/items');
    await page.getByRole('button', { name: 'ทั้งหมด', exact: true }).click();
    await page.fill('#q', '25');
    await expect(countText(page)).toHaveText('1 รายการ');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr')).toContainText('(ตัวอย่าง #25)');
  });

  test('search matches detail text and keeps focus in the box', async ({ page }) => {
    await open(page, '/#/items');
    await page.fill('#q', 'ส่งออก Excel');
    await expect(page.locator('#q')).toBeFocused();
    const rows = page.locator('tbody tr .detail-cell a');
    await expect(rows.first()).toContainText('ส่งออก Excel');
  });

  test('state chips and filters narrow the list, matching Domain', async ({ page }) => {
    await open(page, '/#/items');
    await page.getByRole('button', { name: 'เกินกำหนด', exact: true }).click();
    await page.selectOption('#f-platform', 'INV');
    const expected = await page.evaluate(() => {
      const D = window.Domain;
      const fx = window.__FIXTURE__;
      const rows = fx.rows.map((r) => D.enrich(r, fx.today));
      return D.applyFilters(rows, { platform: ['INV'], state: 'overdue' }).length;
    });
    await expect(countText(page)).toHaveText(`${expected.toLocaleString('th-TH')} รายการ`);
    expect(n(await countText(page).textContent())).toBeGreaterThan(0);
  });

  test('ticket URLs render as links that open in a new tab', async ({ page }) => {
    await open(page, '/#/items');
    await page.getByRole('button', { name: 'ทั้งหมด', exact: true }).click();
    const link = page.getByRole('link', { name: 'Taiga/MANTIS' }).first();
    await expect(link).toHaveAttribute('href', /^https:\/\/taiga\.example\//);
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('clicking a row opens the item form', async ({ page }) => {
    await open(page, '/#/items');
    await page.locator('tbody tr').first().locator('td').nth(2).click();
    await expect(page).toHaveURL(/#\/items\/[^/]+$/);
    await expect(page.locator('#item-form')).toBeVisible();
  });

  test('shows a helpful empty state when nothing matches', async ({ page }) => {
    await open(page, '/#/items');
    await page.fill('#q', 'ไม่มีคำนี้แน่นอน');
    await expect(page.locator('.empty')).toContainText('ไม่พบรายการ');
  });
});
