import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test.describe('US2 Add request', () => {
  test('creates an item with the next ลำดับ', async ({ page }) => {
    await open(page, '/#/new');
    await page.selectOption('#f-platform', 'NHIP');
    await page.selectOption('#f-issueType', 'Requement');
    await page.selectOption('#f-urgency', 'ด่วน');
    await page.fill('#f-system', 'เวชระเบียน');
    await page.fill('#f-detail', 'ทดสอบเพิ่มรายการผ่านแอป');
    await page.selectOption('#f-pm', { index: 1 });
    await page.fill('#f-dueDate', '30/12/2026');
    await page.getByRole('button', { name: 'บันทึกรายการใหม่' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกรายการใหม่แล้ว ลำดับที่ 721');
    await expect(page).toHaveURL(/#\/items\/721$/);
    await expect(page.locator('h1')).toHaveText('รายการ #721');
  });

  test('shows Thai errors on required fields and saves nothing', async ({ page }) => {
    await open(page, '/#/new');
    await page.getByRole('button', { name: 'บันทึกรายการใหม่' }).click();
    await expect(page.locator('[aria-invalid="true"]').first()).toBeFocused();
    await expect(page.locator('#h-detail .err')).toContainText('กรุณากรอก');
    expect(await page.evaluate(() => window.__mockSheet.rows.length)).toBe(720);
  });

  test('status dropdown is in workflow order with numbered steps', async ({ page }) => {
    await open(page, '/#/new');
    const labels = await page.locator('#f-status option').allTextContents();
    expect(labels[0]).toBe('1) 0.รอแจ้งทีมพัฒนา');
    expect(labels[8]).toBe('9) รอ PM ตรวจสอบ Taiga');
    expect(labels.slice(9)).toEqual(['0.แก้ไขเรียบร้อย', '0.ใช้งานได้อยู่แล้ว', '0.ยกเลิก']);
    await expect(page.locator('#f-status')).toHaveValue('0.รอแจ้งทีมพัฒนา');
  });

  test('"วันนี้" fills the date in d/m/yyyy', async ({ page }) => {
    await open(page, '/#/new');
    await page.getByRole('button', { name: 'ใส่วันนี้ในช่อง วันที่ต้องได้' }).click();
    await expect(page.locator('#f-dueDate')).toHaveValue(/^\d{1,2}\/\d{1,2}\/20\d\d$/);
  });
});

test.describe('US3 Safe edit', () => {
  const firstOpenSeq = (page) =>
    page.evaluate(
      () =>
        window.__mockSheet.rows.find(
          (r) => !['0.แก้ไขเรียบร้อย', '0.ยกเลิก', '0.ใช้งานได้อยู่แล้ว'].includes(r.status) && r.developer,
        ).seq,
    );

  test('saves only the changed field', async ({ page }) => {
    await open(page);
    const seq = await firstOpenSeq(page);
    await page.goto(`/#/items/${seq}`);
    const current = await page.locator('#f-developer').inputValue();
    const other = (await page.locator('#f-developer option').allTextContents()).find(
      (t) => t && t !== current && !t.startsWith('—'),
    );
    await page.selectOption('#f-developer', other);
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว (นักพัฒนา)');
  });

  test('refuses to overwrite a cell someone changed in the sheet', async ({ page }) => {
    await open(page);
    const seq = await firstOpenSeq(page);
    await page.goto(`/#/items/${seq}`);
    await page.evaluate((s) => window.__mockSheet.edit(s, 'developer', 'นักพัฒนา ฟ้า (แก้ในชีต)'), seq);
    await page.fill('#f-detail', 'แก้รายละเอียดจากแอป');
    await page.selectOption('#f-developer', { index: 1 });
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.getByRole('alert')).toContainText('มีคนแก้ไขรายการนี้ไปก่อนหน้าคุณ');
  });

  test('cancel sets 0.ยกเลิก after confirmation (no delete)', async ({ page }) => {
    await open(page);
    const seq = await firstOpenSeq(page);
    await page.goto(`/#/items/${seq}`);
    await page.getByRole('button', { name: 'ยกเลิกรายการนี้' }).click();
    await page.locator('dialog').getByRole('button', { name: 'ยกเลิกรายการ' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว (สถานะ)');
    const row = await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s), seq);
    expect(row.status).toBe('0.ยกเลิก');
  });

  test('view-only users cannot add or edit', async ({ page }) => {
    await open(page, '/?viewer=1');
    await expect(page.locator('#nav-add')).toBeHidden();
    await expect(page.locator('.banner.warn')).toContainText('สิทธิ์ดูอย่างเดียว');
    await page.goto('/?viewer=1#/items/5');
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
  });
});

test.describe('US4 My Work', () => {
  test('choose my name then see grouped work', async ({ page }) => {
    await open(page, '/#/my-work');
    await page.selectOption('#f-myname', 'นักพัฒนา แดง');
    await page.getByRole('button', { name: 'ใช้ชื่อนี้' }).click();
    await expect(page.locator('.page-head')).toContainText('นักพัฒนา แดง');
    await expect(page.locator('.work').first()).toBeVisible();
  });
});
