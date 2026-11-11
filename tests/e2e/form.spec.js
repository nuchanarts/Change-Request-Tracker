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
    expect(labels[0]).toBe('1) 0.จัดทำไฟล์แก้ไข');
    expect(labels[4]).toBe('5) dev ขอ Sourecode อจ.');
    expect(labels[10]).toBe('11) รอ Complie ต้องแจ้งอจ.');
    expect(labels.slice(11)).toEqual(['0.ยกเลิก', '0.ใช้งานได้อยู่แล้ว', '0.แก้ไขเรียบร้อย']);
    await expect(page.locator('#f-status')).toHaveValue('0.รอแจ้งทีมพัฒนา');
  });

  test('calendar picker fills dates in the sheet format d/m/yyyy (C.E.)', async ({ page }) => {
    await open(page, '/#/new');
    await page.getByRole('button', { name: 'เลือกวันที่จากปฏิทิน: วันที่ต้องได้' }).click();
    const cal = page.getByRole('dialog', { name: 'เลือกวันที่' });
    await expect(cal).toBeVisible();
    await cal.getByRole('button', { name: 'วันนี้', exact: true }).click();
    await expect(cal).toBeHidden();
    await expect(page.locator('#f-dueDate')).toHaveValue(/^\d{1,2}\/\d{1,2}\/20\d\d$/);
  });

  test('calendar opens on the typed month, navigates, and picks a day', async ({ page }) => {
    await open(page, '/#/new');
    await page.fill('#f-postponedDate', '16/4/2026');
    await page.getByRole('button', { name: 'เลือกวันที่จากปฏิทิน: วันที่เลื่อน' }).click();
    const cal = page.getByRole('dialog', { name: 'เลือกวันที่' });
    await expect(cal).toContainText('เมษายน 2026');
    await expect(cal).toContainText('พ.ศ. 2569');
    await expect(cal.getByRole('button', { name: '16 เมษายน 2026', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await cal.getByRole('button', { name: 'เดือนถัดไป' }).click();
    await expect(cal).toContainText('พฤษภาคม 2026');
    await cal.getByRole('button', { name: '5 พฤษภาคม 2026', exact: true }).click();
    await expect(page.locator('#f-postponedDate')).toHaveValue('5/5/2026');
  });

  test('Escape closes the calendar without changing the date', async ({ page }) => {
    await open(page, '/#/new');
    await page.fill('#f-dueDate', '1/12/2026');
    await page.getByRole('button', { name: 'เลือกวันที่จากปฏิทิน: วันที่ต้องได้' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'เลือกวันที่' })).toBeHidden();
    await expect(page.locator('#f-dueDate')).toHaveValue('1/12/2026');
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
    // developer is a pick-or-type field (datalist): type a different name
    const current = await page.locator('#f-developer').inputValue();
    await page.fill('#f-developer', current === 'นักพัฒนา แดง' ? 'นักพัฒนา ดำ' : 'นักพัฒนา แดง');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกการแก้ไขแล้ว (นักพัฒนา)');
  });

  test('refuses to overwrite a cell someone changed in the sheet', async ({ page }) => {
    await open(page);
    const seq = await firstOpenSeq(page);
    await page.goto(`/#/items/${seq}`);
    await page.evaluate((s) => window.__mockSheet.edit(s, 'developer', 'นักพัฒนา ฟ้า (แก้ในชีต)'), seq);
    await page.fill('#f-detail', 'แก้รายละเอียดจากแอป');
    await page.fill('#f-developer', 'นักพัฒนา แดง');
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

test.describe('Free-text developer and fixed PM list (2026-11-11)', () => {
  test('a new developer name can be typed and saved with a warning', async ({ page }) => {
    await open(page, '/#/new');
    await page.selectOption('#f-platform', 'EHP');
    await page.selectOption('#f-issueType', 'defect');
    await page.selectOption('#f-urgency', 'ปกติ');
    await page.fill('#f-system', 'เวชระเบียน');
    await page.fill('#f-detail', 'ทดสอบนักพัฒนาชื่อใหม่');
    await page.selectOption('#f-pm', { index: 1 });
    await page.fill('#f-dueDate', '30/12/2026');
    await page.fill('#f-developer', 'นักพัฒนาใหม่ ทดสอบ');
    await page.getByRole('button', { name: 'บันทึกรายการใหม่' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกรายการใหม่แล้ว');
  });
});
