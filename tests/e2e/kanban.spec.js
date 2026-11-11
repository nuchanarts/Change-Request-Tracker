import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test.describe('US8 Kanban board', () => {
  test('shows one column per open step plus closed this week', async ({ page }) => {
    await open(page, '/#/kanban');
    await expect(page.locator('.kcol')).toHaveCount(10);
    await expect(page.locator('.kcol').first()).toHaveAttribute('data-status', '0.รอแจ้งทีมพัฒนา');
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
    const card = page.locator('.kcol[data-status="รอ PM ตรวจสอบ Taiga"] .kcard[draggable="true"]').first();
    const id = await card.getAttribute('data-id');
    await card.dragTo(page.locator('.kcol.closed'));
    await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว (สถานะ, วันที่เสร็จ)');
    const row = await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s), id);
    expect(row.status).toBe('0.แก้ไขเรียบร้อย');
    expect(row.doneDate).toMatch(/^\d{1,2}\/\d{1,2}\/20\d\d$/);
  });

  test('view-only users see no move buttons and cards are not draggable', async ({ page }) => {
    await open(page, '/?viewer=1#/kanban');
    await expect(page.locator('.kmove')).toHaveCount(0);
    await expect(page.locator('.kcard[draggable="true"]')).toHaveCount(0);
  });
});
