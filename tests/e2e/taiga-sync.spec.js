import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// Taiga status in the register, mismatch filter, "ปรับตาม Taiga" and the status map (user request 2026-11-24).
// The mock log is built from the fixture: the first three open rows with a Taiga link have Taiga events.
const setup = async (page, { map = {}, query = '' } = {}) => {
  await page.addInitScript((m) => {
    window.__taigaMap = m;
    window.__beforeMock = (rows) => {
      const D = window.Domain;
      const linked = rows.filter((r) => D.isOpen(r.status) && r.detail && /^\d+$/.test(r.seq));
      [0, 1, 2].forEach((i) => {
        linked[i].ticketLinks = [`https://taiga.example/project/sync/us/${i + 1}`];
        linked[i].status = 'รอทีมพัฒนา';
      });
      window.__taigaSeqs = linked.slice(0, 3).map((r) => r.seq);
      const ev = (n, to) => ({
        kind: 'สถานะ',
        link: `https://taiga.example/project/sync/us/${n}`,
        from: 'New',
        to,
        by: 'ริว',
        at: Date.UTC(2026, 10, 24, 3, 5),
      });
      window.__taigaEvents = [ev(1, 'In progress'), ev(2, 'Ready'), ev(3, 'Strange')];
    };
  }, map);
  await open(page, `/${query}#/taiga`);
  if (!query.includes('notaiga')) await expect(page.locator('#tg-table .tg-taiga').first()).toBeVisible();
  return page.evaluate(() => window.__taigaSeqs);
};
const MAP = { 'In progress': 'กำลังพัฒนา', Ready: 'รอทีมพัฒนา' };
const rowOf = (page, seq) => page.locator(`#tg-table tr[data-id="${seq}"]`);

test('shows the Taiga status, who moved it and when, next to the sheet status', async ({ page }) => {
  const [a, b, c] = await setup(page, { map: MAP });
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('In progress');
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('ริว');
  await expect(rowOf(page, a).locator('.tg-taiga')).toContainText('24/11/2026 10:05');
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toContainText('กำลังพัฒนา');
  await expect(rowOf(page, b).locator('.tg-sync-match')).toBeVisible();
  await expect(rowOf(page, c).locator('.tg-sync-unmapped')).toBeVisible();
});

test('filters the items that differ from Taiga', async ({ page }) => {
  const [a] = await setup(page, { map: MAP });
  await page.locator('#f-tg-sync').selectOption('diff');
  await expect(page.locator('#tg-table tbody tr')).toHaveCount(1);
  await expect(rowOf(page, a)).toBeVisible();
  await expect(page.locator('#tg-count')).toHaveText('1');
});

test('"ปรับตาม Taiga" asks first, then saves the status through the normal write path', async ({ page }) => {
  const [a] = await setup(page, { map: MAP });
  const status = () => page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, a);
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page).toHaveURL(/#\/taiga$/); // the row itself is clickable: the button must not open the item
  await page.locator('#dialog').getByRole('button', { name: 'ยกเลิก' }).click();
  expect(await status()).toBe('รอทีมพัฒนา');
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await page.locator('#dialog').getByRole('button', { name: 'ปรับสถานะ' }).click();
  await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว');
  expect(await status()).toBe('กำลังพัฒนา');
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  expect(await page.evaluate(() => window.__mockLog.map((e) => e.column + '>' + e.to))).toEqual([
    'สถานะ>กำลังพัฒนา',
  ]);
});

test('Esc never confirms, even after an earlier confirmation', async ({ page }) => {
  const [a, b] = await setup(page, { map: { 'In progress': 'กำลังพัฒนา', Ready: 'กำลังทดสอบ' } });
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await page.locator('#dialog').getByRole('button', { name: 'ปรับสถานะ' }).click();
  await expect(rowOf(page, a).locator('.tg-sync-match')).toBeVisible();
  await rowOf(page, b)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page.locator('#dialog')).toContainText('#' + b);
  await page.keyboard.press('Escape');
  await expect(page.locator('#dialog')).toBeHidden();
  await page.waitForTimeout(600); // longer than the mock latency: a wrong save would have landed
  expect(await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, b)).toBe(
    'รอทีมพัฒนา',
  );
});

test('a change made in the sheet meanwhile is never overwritten', async ({ page }) => {
  const [a] = await setup(page, { map: MAP });
  await page.evaluate((s) => window.__mockSheet.edit(s, 'status', 'กำลังทดสอบ'), a);
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await page.locator('#dialog').getByRole('button', { name: 'ปรับสถานะ' }).click();
  await expect(page.locator('.toast')).toContainText('มีคนแก้ไขรายการนี้ไปก่อน');
  expect(await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s).status, a)).toBe(
    'กำลังทดสอบ',
  );
});

test('admins pair a Taiga status with an app status; nothing changes until a person applies it', async ({
  page,
}) => {
  const [, , a] = await setup(page);
  await expect(rowOf(page, a).locator('.tg-sync-unmapped')).toBeVisible();
  await page.locator('#tg-map summary').click();
  await page.locator('#tg-map select[data-taiga="Strange"]').selectOption('กำลังพัฒนา');
  await expect(page.locator('.toast')).toContainText('Strange');
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toContainText('กำลังพัฒนา');
  await expect(page.locator('#tg-map')).toHaveAttribute('open', '');
  expect(await page.evaluate(() => window.__mockLog.length)).toBe(0);
});

test('view-only people see the statuses but no buttons and no map', async ({ page }) => {
  const [a] = await setup(page, { map: MAP, query: '?viewer=1' });
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toBeVisible();
  await expect(page.getByRole('button', { name: /ปรับตาม Taiga/ })).toHaveCount(0);
  await expect(page.locator('#tg-map')).toHaveCount(0);
});

test('without the Taiga log the register works as before', async ({ page }) => {
  await setup(page, { query: '?notaiga=1' });
  await expect(page.locator('#tg-table tbody tr').first()).toBeVisible();
  await expect(page.locator('#tg-nolog')).toBeVisible();
  await expect(page.locator('.tg-taiga')).toHaveCount(0);
  await expect(page.locator('#f-tg-sync')).toHaveCount(0);
});

test('no sideways page scroll at any width', async ({ page }) => {
  await setup(page, { map: MAP });
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
});

test('the team table works without any setup, and an admin can switch a pair off', async ({ page }) => {
  const [a] = await setup(page);
  await expect(rowOf(page, a).locator('.tg-sync-diff')).toContainText('กำลังพัฒนา');
  await page.locator('#tg-map summary').click();
  await expect(page.locator('#tg-map select[data-taiga="Done"]')).toHaveValue('0.แก้ไขเรียบร้อย');
  await page.locator('#tg-map select[data-taiga="In progress"]').selectOption('');
  await expect(rowOf(page, a).locator('.tg-sync-unmapped')).toBeVisible();
});

test('applying a status that closes the item says so before saving', async ({ page }) => {
  const [a] = await setup(page, { map: { 'In progress': '0.แก้ไขเรียบร้อย' } });
  await rowOf(page, a)
    .getByRole('button', { name: /ปรับตาม Taiga/ })
    .click();
  await expect(page.locator('#dialog')).toContainText('จะปิดงาน');
});
