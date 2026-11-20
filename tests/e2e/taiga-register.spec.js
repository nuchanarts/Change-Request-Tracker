import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "อยากให้มีทะเบียน ความคืบหน้า taiga" (user, 2026-11-20)
const expected = (page, scope) =>
  page.evaluate((s) => {
    const D = window.Domain;
    const fx = window.__FIXTURE__;
    const rows = fx.rows.filter((r) => String(r.detail).trim()).map((r) => D.enrich(r, fx.today));
    const rep = D.taigaRegister(rows, { scope: s });
    return {
      total: rep.total,
      first: rep.rows[0] && { seq: rep.rows[0].seq, link: D.taigaLink(rep.rows[0]) },
    };
  }, scope);

test('ทะเบียน Taiga lists Taiga items with a progress bar; scope, search and CSV work', async ({ page }) => {
  await open(page, '/#/taiga');
  await expect(page.getByRole('heading', { name: 'ทะเบียน Taiga', level: 1 })).toBeVisible();
  const count = page.locator('#tg-count');
  const open1 = await expected(page, 'open');
  expect(open1.total).toBeGreaterThan(0);
  await expect(count).toHaveText(String(open1.total));
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(open1.total);

  const first = page.locator('#tg-table tbody tr').first();
  if (open1.first.link)
    await expect(first.locator('a.ticket-link')).toHaveAttribute('href', open1.first.link);
  await expect(first.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', /\d+/);

  await page.locator('#f-tg-scope').selectOption('all');
  await expect(count).toHaveText(String((await expected(page, 'all')).total));

  await page.locator('#f-tg-q').fill(String(open1.first.seq));
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(1);
  await page.locator('#f-tg-q').fill('');

  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Export CSV/ }).click(),
  ]);
  expect(dl.suggestedFilename()).toMatch(/^ทะเบียน-Taiga-.*\.csv$/);
});

test('the nav has a ทะเบียน Taiga link', async ({ page }) => {
  await open(page, '/#/monitor');
  await page.getByRole('link', { name: 'ทะเบียน Taiga' }).first().click();
  await expect(page).toHaveURL(/#\/taiga$/);
});
