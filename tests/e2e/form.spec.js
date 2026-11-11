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
    await page.locator('input[name="pm-pick"]').first().check();
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
    expect(labels[0]).toBe('1) จัดทำไฟล์แก้ไข');
    expect(labels[4]).toBe('5) dev ขอ Sourecode อจ.');
    expect(labels[10]).toBe('11) รอ Complie ต้องแจ้งอจ.');
    expect(labels.slice(11)).toEqual(['ยกเลิก', 'ใช้งานได้อยู่แล้ว', 'แก้ไขเรียบร้อย']);
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

  test('delete removes the row after confirmation; rows below move up (user decision 2026-11-11)', async ({
    page,
  }) => {
    await open(page);
    const seq = await firstOpenSeq(page);
    const before = await page.evaluate(() => window.__mockSheet.rows.length);
    await page.goto(`/#/items/${seq}`);
    await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
    await expect(page.locator('dialog')).toContainText('_app_log');
    await page.locator('dialog').getByRole('button', { name: 'ลบรายการ' }).click();
    await expect(page.locator('.toast', { hasText: 'ลบรายการ #' + seq + ' แล้ว' })).toBeVisible();
    await expect(page).toHaveURL(/#\/items$/);
    expect(await page.evaluate(() => window.__mockSheet.rows.length)).toBe(before - 1);
    expect(await page.evaluate((s) => window.__mockSheet.rows.some((r) => r.seq === s), seq)).toBe(false);
  });

  test('closing the confirmation deletes nothing', async ({ page }) => {
    await open(page);
    const seq = await firstOpenSeq(page);
    await page.goto(`/#/items/${seq}`);
    await page.getByRole('button', { name: 'ลบรายการนี้' }).click();
    await page.keyboard.press('Escape');
    expect(await page.evaluate((s) => window.__mockSheet.rows.some((r) => r.seq === s), seq)).toBe(true);
  });

  test('view-only users cannot add or edit', async ({ page }) => {
    await open(page, '/?viewer=1');
    await expect(page.locator('.hero-add')).toHaveCount(0);
    await expect(page.locator('.banner.warn')).toContainText('สิทธิ์ดูอย่างเดียว');
    await page.goto('/?viewer=1#/items/5');
    await expect(page.getByRole('button', { name: 'บันทึกการแก้ไข' })).toHaveCount(0);
  });
});

test.describe('US4 My Work', () => {
  test('tap my name once, then see grouped work', async ({ page }) => {
    await open(page, '/#/my-work');
    await page.getByRole('button', { name: 'นักพัฒนา แดง' }).click();
    await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา แดง');
    await expect(page.locator('.work').first()).toBeVisible();
  });

  test('quick filters: switch person, platform and stage chips, search; remembered; clear', async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('ehp.myname.v1', JSON.stringify('นักพัฒนา แดง')));
    await open(page, '/#/my-work');
    const count = async () => page.locator('.work').count();
    const all = await count();
    await page.getByRole('button', { name: 'EHP', exact: true }).click();
    await expect(page.getByRole('button', { name: 'EHP', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const ehp = await count();
    expect(ehp).toBeLessThan(all);
    for (const c of await page.locator('.work .sub, .work').allTextContents()) expect(c).toContain('EHP');
    await page.getByRole('button', { name: 'ส่งกลับแก้' }).click();
    expect(await count()).toBeLessThanOrEqual(ehp);
    await page.reload();
    await expect(page.getByRole('button', { name: 'ส่งกลับแก้' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'ล้างตัวกรอง' }).first().click();
    expect(await count()).toBe(all);
    const seq = (await page.locator('.work').first().textContent()).match(/#(\d+)/)[1];
    await page.fill('#mw-q', seq);
    await expect(page.locator('.work')).toHaveCount(1);
    await page.fill('#mw-q', '');
    await page.selectOption('#mw-who', 'นักพัฒนา ฟ้า');
    await expect(page.locator('#mw-who')).toHaveValue('นักพัฒนา ฟ้า');
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
    await page.locator('input[name="pm-pick"]').first().check();
    await page.fill('#f-dueDate', '30/12/2026');
    await page.fill('#f-developer', 'นักพัฒนาใหม่ ทดสอบ');
    await page.getByRole('button', { name: 'บันทึกรายการใหม่' }).click();
    await expect(page.locator('.toast')).toContainText('บันทึกรายการใหม่แล้ว');
  });
});

test('PM: several can be picked and are saved as "A, B" in one cell (2026-11-11)', async ({ page }) => {
  await open(page, '/#/new');
  await page.selectOption('#f-platform', 'NHIP');
  await page.selectOption('#f-issueType', 'Requement');
  await page.selectOption('#f-urgency', 'ด่วน');
  await page.fill('#f-system', 'เวชระเบียน');
  await page.fill('#f-detail', 'ทดสอบ PM หลายคน');
  await page.fill('#f-dueDate', '30/12/2026');
  const picks = page.locator('input[name="pm-pick"]');
  await picks.nth(1).check();
  await picks.nth(0).check();
  const names = await picks.evaluateAll((els) => els.slice(0, 2).map((e) => e.value));
  await expect(page.locator('input[name="pm"]')).toHaveValue(names.join(', ')); // list order, not click order
  await page.getByRole('button', { name: 'บันทึกรายการใหม่' }).click();
  await expect(page.locator('.toast')).toContainText('บันทึกรายการใหม่แล้ว');
  const row = await page.evaluate(() => window.__mockSheet.rows.find((r) => r.detail === 'ทดสอบ PM หลายคน'));
  expect(row.pm).toBe(names.join(', '));
});

test.describe('Assign page for the dev lead (2026-11-11)', () => {
  test('lists open items without a developer and assigns one through the safe update path', async ({
    page,
  }) => {
    await open(page, '/#/assign');
    await expect(page.locator('#nav-assign')).toBeVisible();
    const before = Number(await page.locator('#nav-assign-count').textContent());
    expect(before).toBeGreaterThan(0);
    await expect(page.locator('.as-row')).toHaveCount(before);
    const first = page.locator('.as-row').first();
    const id = await first.getAttribute('data-id');
    await page.locator('.as-dev').first().click(); // fills the first box from the workload list
    const name = await first.locator('input[name="developer"]').inputValue();
    expect(name).not.toBe('');
    await first.getByRole('button', { name: 'มอบหมาย' }).click();
    await expect(page.locator('.toast', { hasText: 'มอบหมาย #' + id })).toBeVisible();
    await expect(page.locator('#nav-assign-count')).toHaveText(String(before - 1));
    const row = await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s), id);
    expect(row.developer).toBe(name);
  });

  test('viewers do not see the assign menu', async ({ page }) => {
    await open(page, '/?viewer=1#/monitor');
    await expect(page.locator('#nav-assign')).toBeHidden();
  });
});

test.describe('After saving an edit, return to the page it was opened from (2026-11-11)', () => {
  test('from the list: back to the list at the same scroll position', async ({ page }) => {
    await open(page, '/#/items');
    const row = page.locator('tbody tr').nth(20);
    await row.scrollIntoViewIfNeeded();
    const y = await page.evaluate(() => window.scrollY);
    await row.locator('.detail-cell a').click();
    await expect(page).toHaveURL(/#\/items\/.+/);
    await page.fill('#f-devHours', '7');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page.locator('.toast').first()).toContainText('บันทึกการแก้ไขแล้ว');
    await expect(page).toHaveURL(/#\/items$/);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(80);
  });

  test('from the board: back to the board', async ({ page }) => {
    await open(page, '/#/kanban');
    await page.locator('.kcard .ktitle').first().click();
    await page.fill('#f-devHours', '3');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page).toHaveURL(/#\/kanban$/);
    await expect(page.locator('.board')).toBeVisible();
  });

  test('a failed save stays on the form', async ({ page }) => {
    await open(page, '/#/items');
    await page.locator('tbody tr .detail-cell a').first().click();
    await page.fill('#f-dueDate', 'ไม่ใช่วันที่');
    await page.getByRole('button', { name: 'บันทึกการแก้ไข' }).click();
    await expect(page).toHaveURL(/#\/items\/.+/);
  });
});
