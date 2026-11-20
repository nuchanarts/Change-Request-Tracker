import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "มีกราฟฟิก ให้ดูน่าใช้งาน" (user, 2026-11-20): two charts on หน้าหลัก, numbers from Domain, click to drill.
const expected = (page) =>
  page.evaluate(() => {
    const D = window.Domain;
    const fx = window.__FIXTURE__;
    const rows = fx.rows.filter((r) => String(r.detail).trim()).map((r) => D.enrich(r, fx.today));
    return { months: D.closedByMonth(rows, fx.today, 6), plats: D.openByPlatform(rows) };
  });

test('closed-per-month and open-by-platform charts match Domain and drill down', async ({ page }) => {
  await open(page);
  const exp = await expected(page);

  const cols = page.locator('#chart-closed .col');
  await expect(cols).toHaveCount(6);
  for (let i = 0; i < 6; i++)
    await expect(cols.nth(i)).toHaveAttribute('data-count', String(exp.months[i].count));
  await expect(page.locator('#chart-closed')).toContainText(exp.months[5].label);

  const bars = page.locator('#chart-platform .pbar');
  await expect(bars).toHaveCount(exp.plats.length);
  await expect(bars.first()).toContainText(exp.plats[0].platform);
  await expect(bars.first().locator('.ptotal')).toHaveText(String(exp.plats[0].open));
  await expect(page.locator('#chart-platform .legend')).toContainText('เกินกำหนด');

  // a column opens the items behind it
  const last = exp.months[5];
  if (last.count) {
    await cols.nth(5).locator('button').click();
    await expect(page.locator('.drill')).toContainText(`(${last.count} รายการ)`);
  }
});
