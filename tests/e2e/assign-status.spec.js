import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "มอบหมายงาน อยากให้กรองสถานะได้ … รอจัดทำไฟล์ หัวหน้า dev ก็ยังไม่อยากจะมอบหมายงาน" (user, 2026-11-18)
const queueStatuses = (page) =>
  page.evaluate(() => {
    const D = window.Domain;
    const fx = window.__FIXTURE__;
    const rows = fx.rows.filter((r) => String(r.detail || '').trim()).map((r) => D.enrich(r, fx.today));
    const q = D.unassignedQueue(rows, fx.today);
    const by = {};
    q.forEach((r) => (by[r.status] = (by[r.status] || 0) + 1));
    return { total: q.length, by };
  });

test('assign page: hide a status with its chip, and it is remembered', async ({ page }) => {
  await open(page, '/#/assign');
  const { total, by } = await queueStatuses(page);
  const [status, count] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
  const rows = page.locator('.as-list > li');
  await expect(rows).toHaveCount(total);
  const chip = page.locator('.as-status [data-action="as-status"][data-status="' + status + '"]');
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toContainText(String(count));
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect(rows).toHaveCount(total - count);
  await page.reload();
  await expect(page.locator('.loading')).toHaveCount(0);
  await expect(rows).toHaveCount(total - count);
  await page.locator('[data-action="as-status-all"]').click();
  await expect(rows).toHaveCount(total);
});

test('จัดการสิทธิ์ is an icon in the menu; its name shows on hover', async ({ page }) => {
  await open(page, '/#/monitor');
  const link = page.locator('#nav-access');
  await expect(link).toHaveClass(/nav-icon-only/);
  await expect(link).toHaveAttribute('title', 'จัดการสิทธิ์');
  await expect(link).toHaveAccessibleName('จัดการสิทธิ์');
});
