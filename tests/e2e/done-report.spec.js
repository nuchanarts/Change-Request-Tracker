import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// Monthly closed-work report (user request 2026-11-20).
const expected = (page, statuses, period) =>
  page.evaluate(
    ([s, p]) => {
      const D = window.Domain;
      const fx = window.__FIXTURE__;
      const rows = fx.rows.filter((r) => String(r.detail).trim()).map((r) => D.enrich(r, fx.today));
      return D.doneReport(rows, { statuses: s === 'closed' ? D.CLOSED : s ? [s] : [], period: p }).total;
    },
    [statuses, period],
  );

test('defaults to แก้ไขเรียบร้อย this month; status, period and CSV export work', async ({ page }) => {
  await open(page, '/#/done-report');
  await expect(page.getByRole('heading', { name: 'รายงานงานที่ปิด', level: 1 })).toBeVisible();
  const today = await page.evaluate(() => window.__FIXTURE__.today);
  const count = page.locator('#dr-count');

  const month = await expected(page, '0.แก้ไขเรียบร้อย', { mode: 'month', y: today.y, m: today.m });
  await expect(count).toHaveText(String(month));
  await expect(page.locator('#dr-table tbody tr')).toHaveCount(month);
  await expect(page.locator('#f-dr-status')).toHaveValue('0.แก้ไขเรียบร้อย');

  await page.locator('#f-dr-status').selectOption('closed');
  const closed = await expected(page, 'closed', { mode: 'month', y: today.y, m: today.m });
  await expect(count).toHaveText(String(closed));

  await page.locator('#f-dr-mode').selectOption('year');
  await expect(page.locator('#f-dr-month')).toHaveCount(0);
  await expect(count).toHaveText(String(await expected(page, 'closed', { mode: 'year', y: today.y })));

  await page.locator('#f-dr-mode').selectOption('all');
  await expect(count).toHaveText(String(await expected(page, 'closed', { mode: 'all' })));

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export CSV/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const text = await (await download.createReadStream()).toArray();
  const csv = Buffer.concat(text).toString('utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('วันที่เสร็จ');
  expect(csv.trim().split('\r\n')).toHaveLength((await expected(page, 'closed', { mode: 'all' })) + 1);
});

test('custom วันที่เสร็จ range', async ({ page }) => {
  await open(page, '/#/done-report');
  await page.locator('#f-dr-mode').selectOption('range');
  await page.locator('#f-dr-from').fill('1/1/2020');
  await page.locator('#f-dr-to').fill('31/12/2030');
  await page.locator('#f-dr-to').blur();
  const total = await expected(page, '0.แก้ไขเรียบร้อย', { mode: 'all' });
  await expect(page.locator('#dr-count')).toHaveText(String(total));
});
