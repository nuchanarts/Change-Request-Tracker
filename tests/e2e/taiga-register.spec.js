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
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(Math.min(50, open1.total));

  const first = page.locator('#tg-table tbody tr').first();
  if (open1.first.link)
    await expect(first.locator('a.ticket-link')).toHaveAttribute('href', open1.first.link);
  await expect(first.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow', /\d+/);

  await page.getByRole('button', { name: 'ทั้งหมด', exact: true }).click();
  await expect(count).toHaveText(String((await expected(page, 'all')).total));

  await page.locator('#q').fill(String(open1.first.seq));
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(1);
  await page.locator('#q').fill('');

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

// "ยุบเมนู รายการทั้งหมด เอาความสามารถไปใส่ใน ทะเบียน Taiga เช่นตัวกรอง" (user, 2026-11-25)
const total = (page, kind, f = {}) =>
  page.evaluate(
    ([k, filters]) => {
      const D = window.Domain;
      const fx = window.__FIXTURE__;
      const rows = fx.rows.filter((r) => String(r.detail).trim()).map((r) => D.enrich(r, fx.today));
      return D.taigaRegister(D.applyFilters(rows, filters), { kind: k }).total;
    },
    [kind, f],
  );

test('every item is one click away, with the shared filters; the choice is remembered', async ({ page }) => {
  await open(page, '/#/taiga');
  const count = page.locator('#tg-count');
  await expect(page.getByRole('button', { name: 'งาน Taiga', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(count).toHaveText(String(await total(page, 'taiga')));
  await page.getByRole('button', { name: 'ทุกรายการ', exact: true }).click();
  const all = await total(page, 'all');
  expect(all).toBeGreaterThan(await total(page, 'taiga'));
  await expect(count).toHaveText(String(all));
  await page.locator('#f-platform').selectOption('INV');
  await expect(count).toHaveText(String(await total(page, 'all', { platform: ['INV'] })));
  await page.reload();
  await expect(count).toHaveText(String(await total(page, 'all', { platform: ['INV'] })));
});

test('a search that only matches other work offers to show it', async ({ page }) => {
  await open(page, '/#/taiga');
  const seq = await page.evaluate(() => {
    const D = window.Domain;
    const rows = window.__FIXTURE__.rows.map((r) => D.enrich(r, window.__FIXTURE__.today));
    return rows.filter((r) => r.isOpen && r.seq > 99 && !D.taigaRegister([r], {}).total)[0].seq;
  });
  await page.locator('#q').fill(String(seq));
  await page.getByRole('button', { name: /ไม่ใช่งาน Taiga/ }).click();
  await expect(page.locator(`#tg-table tr[data-id="${seq}"]`)).toBeVisible();
});

test('sorting, pages and the drill-down from หน้าหลัก work in the register', async ({ page }, info) => {
  await open(page, '/#/taiga');
  const first = () => page.locator('#tg-table tbody tr').first().getAttribute('data-id');
  const newest = await first();
  if (info.project.name === 'desktop') {
    await page.locator('th[data-col="seq"] button').click();
    await expect.poll(first).not.toBe(newest);
  }
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.locator('.pager')).toContainText('หน้า 2');
  await page.goto('/#/monitor');
  const metric = page.locator('[data-metric="overdue"]');
  const n = Number((await metric.locator('.value').textContent()).replace(/[^\d]/g, ''));
  await metric.locator('button').click();
  await expect(page).toHaveURL(/#\/taiga$/);
  await expect(page.locator('#tg-count')).toHaveText(String(n)); // every item, not only Taiga work
  await expect(page.locator('#filters')).toHaveCount(0);
  await page.getByRole('button', { name: 'ดูทั้งทะเบียน' }).click();
  await expect(page.locator('#filters')).toBeVisible();
});

test('the menu has no รายการทั้งหมด; an item page keeps ทะเบียน Taiga marked', async ({ page }) => {
  await open(page, '/#/items/5');
  const nav = page.getByRole('navigation', { name: 'เมนูหลัก' });
  await expect(nav.getByRole('link', { name: 'รายการทั้งหมด' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'ทะเบียน Taiga' })).toHaveAttribute('aria-current', 'page');
});

test('the whole table fits a 1366 px screen and an unused filter bar has no heading line', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'cards on a phone');
  await page.setViewportSize({ width: 1366, height: 800 });
  await open(page, '/#/taiga');
  await expect(page.locator('th[data-col="taiga"]')).toBeVisible();
  const over = await page.locator('.table-wrap').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
  await expect(page.locator('#filters .filters-head')).toHaveCount(0);
  await page.locator('#f-platform').selectOption('INV');
  await expect(page.getByRole('button', { name: 'ล้างตัวกรอง' })).toBeVisible();
});
