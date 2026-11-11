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
    // own column (2026-11-11)
    const link = page.locator('td.ticket-cell .ticket-link').first();
    await expect(link).toHaveAttribute('href', /^https:\/\/taiga\.example\//);
    await expect(link).toHaveAttribute('target', '_blank');
  });

  test('clicking a row opens the item form', async ({ page }) => {
    await open(page, '/#/items');
    await page.locator('tbody tr').first().locator('td:has(.badge)').first().click(); // status cell: visible on all sizes
    await expect(page).toHaveURL(/#\/items\/[^/]+$/);
    await expect(page.locator('#item-form')).toBeVisible();
  });

  test('shows a helpful empty state when nothing matches', async ({ page }) => {
    await open(page, '/#/items');
    await page.fill('#q', 'ไม่มีคำนี้แน่นอน');
    await expect(page.locator('.empty')).toContainText('ไม่พบรายการ');
  });
});

const headerTexts = async (page) => {
  // wait until the table is rendered (e.g. right after a reload)
  await page.locator('table.responsive thead th').first().waitFor({ state: 'attached' }); // thead is hidden on mobile
  return (await page.locator('table.responsive thead th').allTextContents()).map((h) =>
    h.replace(/[▲▼]/g, '').trim(),
  );
};

test('items table: platform and system have their own columns, before the detail; distinct header', async ({
  page,
}) => {
  await open(page, '/#/items');
  expect(await headerTexts(page)).toEqual([
    'ลำดับ',
    'แพลตฟอร์ม',
    'ระบบงาน',
    'รายละเอียด',
    'Taiga/MANTIS',
    'สถานะ',
    'ความเร่งด่วน',
    'นักพัฒนา',
    'PM',
    'กำหนดส่ง',
  ]);
  await expect(page.locator('table.responsive thead th').first()).toHaveCSS('font-weight', '600');
});

test('columns can be rearranged with the buttons, are remembered, and can be reset', async ({ page }) => {
  await open(page, '/#/items');
  await page.getByRole('button', { name: 'จัดคอลัมน์' }).click();
  await page.getByRole('button', { name: 'ย้าย ระบบงาน ไปทางซ้าย' }).click();
  expect((await headerTexts(page)).slice(0, 3)).toEqual(['ลำดับ', 'ระบบงาน', 'แพลตฟอร์ม']);
  await page.reload();
  expect((await headerTexts(page)).slice(0, 3)).toEqual(['ลำดับ', 'ระบบงาน', 'แพลตฟอร์ม']);
  await page.getByRole('button', { name: 'จัดคอลัมน์' }).click();
  await page.getByRole('button', { name: 'คืนค่าเริ่มต้น' }).click();
  expect((await headerTexts(page)).slice(0, 3)).toEqual(['ลำดับ', 'แพลตฟอร์ม', 'ระบบงาน']);
});

test('dragging a header moves the column', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'drag is a desktop gesture; buttons cover touch');
  await open(page, '/#/items');
  await page.locator('th[data-col="due"]').dragTo(page.locator('th[data-col="platform"]'));
  expect((await headerTexts(page)).slice(0, 3)).toEqual(['ลำดับ', 'กำหนดส่ง', 'แพลตฟอร์ม']);
});

test('a ticket number with a link embedded in the sheet cell is clickable (2026-11-11)', async ({ page }) => {
  await open(page, '/#/items');
  const seq = await page.evaluate(
    () => window.__mockSheet.rows.find((r) => r.ticketLinks && r.ticketLinks.length).seq,
  );
  const url = await page.evaluate(
    (s) => window.__mockSheet.rows.find((r) => r.seq === s).ticketLinks[0],
    seq,
  );
  await page.fill('#q', seq);
  const link = page.locator('tbody tr').first().locator('a.ticket-link');
  await expect(link).toHaveAttribute('href', url);
  await page.goto(`/#/items/${seq}`);
  await expect(page.locator('.ticket-actions a.ticket-link').first()).toHaveAttribute('href', url);
  await expect(page.locator('#h-ticket')).toContainText('มีลิงก์ฝังอยู่');
});
