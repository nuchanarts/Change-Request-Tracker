import { test, expect } from '@playwright/test';
import { open, expectedMetrics, statValue } from './helpers.js';

const n = (s) => Number(String(s).replace(/[^\d]/g, ''));

test.describe('US1 Monitor', () => {
  test('numbers match the shared Domain definitions', async ({ page }) => {
    await open(page);
    const exp = await expectedMetrics(page);
    expect(n(await statValue(page, 'open').textContent())).toBe(exp.open);
    expect(n(await statValue(page, 'overdue').textContent())).toBe(exp.overdue);
    expect(n(await statValue(page, 'closed-week').textContent())).toBe(exp.week);
    expect(n(await statValue(page, 'closed-month').textContent())).toBe(exp.month);
  });

  test('pipeline shows every open workflow step and highlights the bottleneck', async ({ page }) => {
    await open(page);
    await expect(page.locator('.stage')).toHaveCount(11);
    await expect(page.locator('.stage.bottleneck')).toHaveCount(1);
  });

  test('drill-down list size equals the clicked number', async ({ page }) => {
    await open(page);
    const overdue = n(await statValue(page, 'overdue').textContent());
    await page.locator('[data-metric="overdue"] button').click();
    await expect(page).toHaveURL(/#\/items$/);
    await expect(page.locator('.drill')).toContainText(`(${overdue} รายการ)`);
    await expect(page.locator('.page-head .muted').first()).toContainText(String(overdue));
  });

  test('filters recompute every number', async ({ page }) => {
    await open(page);
    await page.selectOption('#f-platform', 'NHIP');
    const exp = await expectedMetrics(page, { platform: ['NHIP'] });
    await expect(statValue(page, 'open')).toHaveText(exp.open.toLocaleString('th-TH'));
    await expect(statValue(page, 'overdue')).toHaveText(exp.overdue.toLocaleString('th-TH'));
  });

  test('data-quality panel lists rows with wrong-column values', async ({ page }) => {
    await open(page);
    const panel = page.locator('[data-panel="quality"]');
    await expect(panel).toContainText('รายการ');
    await expect(panel).toContainText('แพลตฟอร์ม');
  });

  test('shows a clear error when the sheet cannot be opened', async ({ page }) => {
    await open(page, '/?fail=bootstrap');
    await expect(page.getByRole('alert')).toContainText('ไม่มีสิทธิ์เปิดชีต');
    await expect(page.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeVisible();
  });
});
