import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test.describe('US8 Kanban board', () => {
  test('shows one column per open step plus closed this week', async ({ page }) => {
    await open(page, '/#/kanban');
    await expect(page.locator('.kcol[data-status="0.รอแจ้งทีมพัฒนา"]')).toHaveCount(1);
    await expect(page.locator('.kcol.closed')).toHaveCount(1);
    // 11 working steps (PM-approved order) + closed this week, plus the "other" column when needed
    await expect(page.locator('.kcol:not(.other):not(.closed)')).toHaveCount(11);
    await expect(page.locator('.kcol:not(.other)').first()).toHaveAttribute(
      'data-status',
      '0.จัดทำไฟล์แก้ไข',
    );
    await expect(page.locator('.kcol.bottleneck')).toHaveCount(1);
  });

  test('▶ moves a card to the next step through the safe update path', async ({ page }) => {
    await open(page, '/#/kanban');
    const col = page.locator('.kcol[data-status="รอทีมพัฒนา"]');
    const card = col.locator('.kcard').first();
    const id = await card.getAttribute('data-id');
    await card.getByRole('button', { name: /ไป กำลังพัฒนา$/ }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว (สถานะ)');
    await expect(page.locator(`.kcol[data-status="กำลังพัฒนา"] .kcard[data-id="${id}"]`)).toHaveCount(1);
  });

  test('drag to the closed column sets 0.แก้ไขเรียบร้อย and today as done date', async ({ page }) => {
    test.skip(
      test.info().project.name !== 'desktop',
      'drag & drop is a desktop gesture; buttons cover touch',
    );
    await open(page, '/#/kanban');
    await page.setViewportSize({ width: 1920, height: 1000 });
    await page.locator('.kcol.closed').scrollIntoViewIfNeeded();
    // the last working step sits next to the closed column, so the drag does not scroll the board
    const card = page.locator('.kcol[data-status="รอ Complie ต้องแจ้งอจ."] .kcard[draggable="true"]').first();
    const id = await card.getAttribute('data-id');
    await card.dragTo(page.locator('.kcol.closed'));
    await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว (สถานะ, วันที่เสร็จ)');
    const row = await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s), id);
    expect(row.status).toBe('0.แก้ไขเรียบร้อย');
    expect(row.doneDate).toMatch(/^\d{1,2}\/\d{1,2}\/20\d\d$/);
  });

  test('open items with a blank status get their own column and every open item is on the board', async ({
    page,
  }) => {
    await open(page, '/#/kanban');
    const other = page.locator('.kcol.other');
    await expect(other).toHaveCount(1);
    await expect(other.locator('.kcard')).toHaveCount(1);
    const onBoard = await page.evaluate(() =>
      [...document.querySelectorAll('.kcol:not(.closed) .kcount')].reduce(
        (n, e) => n + Number(e.textContent),
        0,
      ),
    );
    await page.goto('/#/monitor');
    // every open item (งานค้าง on Monitor) is somewhere on the board
    await expect(page.locator('[data-metric="open"] .value')).toHaveText(onBoard.toLocaleString('th-TH'));
  });

  test('view-only users see no move buttons and cards are not draggable', async ({ page }) => {
    await open(page, '/?viewer=1#/kanban');
    await expect(page.locator('.kmove')).toHaveCount(0);
    await expect(page.locator('.kcard[draggable="true"]')).toHaveCount(0);
  });
});

test.describe('Kanban navigation and collapse (2026-11-11)', () => {
  test('jump bar on top scrolls to a column; columns can be collapsed and remembered', async ({ page }) => {
    await open(page, '/#/kanban');
    await expect(page.locator('.kjump')).toBeVisible();
    const bar = await page.locator('.kjump').boundingBox();
    const board = await page.locator('.board').boundingBox();
    expect(bar.y).toBeLessThan(board.y); // navigation sits above the board
    await page.locator('.kjump-chip', { hasText: 'รอ Complie' }).click();
    await expect(page.locator('.kcol[data-status="รอ Complie ต้องแจ้งอจ."]')).toBeInViewport();
    await page.getByRole('button', { name: 'ยุบคอลัมน์ กำลังพัฒนา' }).click();
    await expect(page.locator('.kcol[data-status="กำลังพัฒนา"]')).toHaveClass(/collapsed/);
    await expect(page.locator('.kcol[data-status="กำลังพัฒนา"] .kcard')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.kcol[data-status="กำลังพัฒนา"]')).toHaveClass(/collapsed/);
    await page.getByRole('button', { name: 'ขยายคอลัมน์ กำลังพัฒนา' }).click();
    await expect(page.locator('.kcol[data-status="กำลังพัฒนา"] .kcard').first()).toBeVisible();
  });
});

test('columns waiting on อจ. sit after "ปิดงานสัปดาห์นี้" (2026-11-11)', async ({ page }) => {
  await open(page, '/#/kanban');
  const order = await page
    .locator('.kcol')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
  expect(order.slice(-3)).toEqual(['0.แก้ไขเรียบร้อย', 'dev ขอ Sourecode อจ.', 'รอ Complie ต้องแจ้งอจ.']);
  const chips = await page.locator('.kjump-chip .kjump-name').allTextContents();
  expect(chips.slice(-2)).toEqual(['dev ขอ Sourecode อจ.', 'รอ Complie ต้องแจ้งอจ.']);
});

test('empty columns are hidden; "แสดงคอลัมน์ว่าง" brings them back and is remembered (2026-11-11)', async ({
  page,
}) => {
  // make one workflow step empty: move every card out of "รอ compile"
  await page.addInitScript(() => {
    window.__beforeMock = (rows) =>
      rows.forEach((r) => r.status === 'รอ compile' && (r.status = 'กำลังทดสอบ'));
  });
  await open(page, '/#/kanban');
  await expect(page.locator('.kcol[data-status="รอ compile"]')).toHaveCount(0);
  await expect(page.locator('.kjump-chip', { hasText: 'รอ compile' })).toHaveCount(0);
  await expect(page.locator('.kcol .kempty')).toHaveCount(0); // no empty column on the board
  const show = page.getByRole('button', { name: /แสดงคอลัมน์ว่าง \(\d+\)/ });
  await show.click();
  await expect(page.locator('.kcol[data-status="รอ compile"]')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.kcol[data-status="รอ compile"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'ซ่อนคอลัมน์ว่าง' }).click();
  await expect(page.locator('.kcol[data-status="รอ compile"]')).toHaveCount(0);
});
