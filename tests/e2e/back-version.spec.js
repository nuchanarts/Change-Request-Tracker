import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

for (const mode of ['', '?gas=1']) {
  test.describe(`In-app back button ${mode ? '(Apps Script sandbox)' : '(browser)'}`, () => {
    test('item page → กลับ returns to the list it came from', async ({ page }) => {
      await open(page, mode ? '/?gas=1&hash=/items' : '/#/items');
      await page.getByRole('button', { name: 'เกินกำหนด', exact: true }).click();
      await page.locator('tbody tr').first().locator('.detail-cell a').click();
      await expect(page.locator('#item-form')).toBeVisible();
      await page.getByRole('button', { name: 'กลับ' }).click();
      await expect(page.getByRole('heading', { name: 'รายการทั้งหมด', level: 1 })).toBeVisible();
      await expect(page.getByRole('button', { name: 'เกินกำหนด', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    test('drill-down → กลับ returns to Monitor', async ({ page }) => {
      await open(page, `/${mode}`);
      await page.locator('[data-metric="overdue"] button').click();
      await expect(page.locator('.drill')).toBeVisible();
      await page.getByRole('button', { name: 'กลับ' }).click();
      await expect(page.getByRole('heading', { name: 'ภาพรวมงานขอแก้ไขโปรแกรม' })).toBeVisible();
    });

    test('opening an item directly → กลับ goes to the list', async ({ page }) => {
      await open(page, `/${mode}${mode ? '&hash=/items/5' : '#/items/5'}`);
      await expect(page.locator('#item-form')).toBeVisible();
      await page.getByRole('button', { name: 'กลับ' }).click();
      await expect(page.getByRole('heading', { name: 'รายการทั้งหมด', level: 1 })).toBeVisible();
    });
  });
}

test('the app version is shown on screen', async ({ page }) => {
  await open(page);
  const pkg = await (await fetch('http://localhost:5174/version.txt')).text().catch(() => '');
  await expect(page.locator('[data-app-version]')).toHaveText(/^v\d+\.\d+\.\d+$/);
  if (pkg) await expect(page.locator('[data-app-version]')).toHaveText('v' + pkg.trim());
});
