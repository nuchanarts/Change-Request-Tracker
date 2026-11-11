import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test.describe('Navigation order, Taiga link, access admin (2026-11-11)', () => {
  test('top menu is in the requested order with Taiga and admin links', async ({ page }) => {
    await open(page);
    const names = (await page.locator('.nav a:visible').allTextContents()).map((t) =>
      t.replace(/\d+/g, '').trim(),
    );
    expect(names).toEqual([
      'ภาพรวม',
      'เพิ่มรายการ',
      'บอร์ดงาน',
      'งานพัฒนาของฉัน',
      'มอบหมายงาน',
      'รายการทั้งหมด',
      'วิธีใช้งาน',
      'จัดการสิทธิ์',
      'Taiga ↗',
    ]);
    await expect(page.locator('.nav a.nav-ext')).toHaveAttribute('href', 'https://taiga.hosxp.net/login');
  });

  test('admins approve a pending request and add a new member', async ({ page }) => {
    await open(page, '/#/access');
    await expect(page.getByRole('heading', { name: 'จัดการสิทธิ์', level: 1 })).toBeVisible();
    await page
      .locator('.access-req')
      .filter({ hasText: 'newbie@example.com' })
      .getByRole('button', { name: 'อนุญาต' })
      .click();
    await expect(page.locator('.toast')).toContainText('newbie@example.com');
    await expect(page.locator('.access-pending')).toHaveCount(0);
    await page.fill('#f-acc-email', 'tester2@gmail.com');
    await page.getByRole('button', { name: 'เพิ่มเข้าทีม' }).click();
    await expect(page.locator('.access-table')).toContainText('tester2@gmail.com');
  });

  test('non-admins do not see the admin page', async ({ page }) => {
    await open(page, '/?notallowed=1');
    await expect(page.locator('#nav-access')).toBeHidden();
  });

  test('item form shows a clickable Taiga link and the Taiga login button', async ({ page }) => {
    await open(page);
    const id = await page.evaluate(() => window.__mockSheet.rows.find((r) => /^https/.test(r.ticket)).seq);
    await page.goto('/#/items/' + id);
    await expect(page.locator('.ticket-actions .ticket-link')).toHaveAttribute('target', '_blank');
    await expect(page.locator('.ticket-actions .taiga-btn')).toHaveAttribute(
      'href',
      'https://taiga.hosxp.net/login',
    );
  });
});

test.describe('My Work by week', () => {
  test('shows urgent / this week / next week / done tiles and sections', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('ehp.myname.v1', JSON.stringify('นักพัฒนา แดง')));
    await open(page, '/#/my-work');
    await expect(page.locator('.mw-tile')).toHaveCount(4);
    await expect(page.locator('#mw-urgent h2')).toContainText('ต้องตามด่วน');
    await expect(page.locator('#mw-this h2')).toContainText('ต้องทำสัปดาห์นี้');
    await expect(page.locator('#mw-plan h2')).toContainText('แผนรายสัปดาห์');
  });
});

test.describe('Export summary', () => {
  test('builds the text report, per PM, and copies it', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page);
    await page.getByRole('button', { name: 'สรุปรายงาน (Export)' }).click();
    const text = page.locator('#rep-text');
    await expect(text).toHaveValue(/สรุปรายการขอแก้ไขโปรแกรม ประจำเดือน/);
    await expect(text).toHaveValue(/3\. รายการเกินกำหนดระยะเวลา/);
    // several PMs can be picked (2026-11-11)
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const picks = page.locator('input[name="rep-pm-pick"]');
    const pms = await picks.evaluateAll((els) => els.slice(0, 2).map((e) => e.value));
    await picks.nth(0).check();
    await expect(text).toHaveValue(new RegExp('PM ผู้รับผิดชอบ: ' + escapeRe(pms[0]) + '\n'));
    await picks.nth(1).check();
    await expect(text).toHaveValue(new RegExp('PM ผู้รับผิดชอบ: ' + escapeRe(pms.join(', ')) + '\n'));
    await page.fill('#f-rep-since', '700');
    await page.locator('#f-rep-since').dispatchEvent('change');
    await expect(text).toHaveValue(/ตั้งแต่ลำดับ 701/);
    await page.getByRole('button', { name: 'คัดลอกข้อความ' }).click();
    await expect(page.locator('.toast')).toContainText('คัดลอก');
  });
});

test.describe('Overdue panel', () => {
  test('shows the on-time ring and age buckets', async ({ page }) => {
    await open(page);
    await expect(page.locator('.od-panel .ring')).toBeVisible();
    await expect(page.locator('.od-bucket')).toHaveCount(4);
    await expect(page.locator('.od-days').first()).toHaveCSS('white-space', 'nowrap');
  });
});

test('user menu shows the account and logout / switch-account links', async ({ page }) => {
  await open(page);
  await page.locator('#user-menu summary').click();
  await expect(page.locator('#user-email')).toHaveText('tester@example.com');
  await expect(page.getByRole('link', { name: 'ออกจากระบบ' })).toHaveAttribute(
    'href',
    /accounts\.google\.com\/Logout/,
  );
  await expect(page.getByRole('link', { name: 'ออกจากระบบ' })).toHaveAttribute('target', '_top');
  // Google shows an error page for a continue URL outside google.com (user report 2026-11-11)
  const href = await page.getByRole('link', { name: 'ออกจากระบบ' }).getAttribute('href');
  expect(href).not.toMatch(/continue=/);
  await expect(page.getByRole('link', { name: 'สลับบัญชี Google' })).toBeVisible();
});

test('filters use the full width (six equal columns on desktop)', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'desktop layout');
  await open(page);
  const form = await page.locator('#filters').boundingBox();
  const last = await page.locator('#filters .field').last().boundingBox();
  expect(form.x + form.width - (last.x + last.width)).toBeLessThan(40);
});

test('admins can repair dropdown chips', async ({ page }) => {
  await open(page, '/#/access');
  await page.getByRole('button', { name: 'ซ่อมสี dropdown' }).click();
  await expect(page.locator('.toast')).toContainText('ซ่อมแล้ว 3 ช่อง');
});

test('My Work (developer): urgent and this week side by side, done this week, no "no due" section', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ehp.myname.v1', JSON.stringify('นักพัฒนา แดง')));
  await open(page, '/#/my-work');
  await expect(page.locator('.mw-two > #mw-urgent')).toHaveCount(1);
  await expect(page.locator('.mw-two > #mw-this')).toHaveCount(1);
  await expect(page.locator('#mw-nodue')).toHaveCount(0);
  await expect(page.locator('.mw-tile.good')).toHaveCount(1);
});

test('My Work (PM): "no due date" section belongs to the PM tab, no "done" encouragement', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('ehp.myname.v1', JSON.stringify('พีเอ็ม สมใจ'));
  });
  await open(page, '/#/my-work/pm');
  await expect(page.locator('#mw-nodue')).toHaveCount(1);
  await expect(page.locator('#mw-done')).toHaveCount(0);
  await expect(page.locator('.mw-tile.plan')).toHaveCount(1);
});

test('งานพัฒนาของฉัน: developer menu with a week planner that moves by week; PM view is a link away', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('ehp.myname.v1', JSON.stringify('นักพัฒนา แดง')));
  await open(page, '/#/my-work');
  await expect(page.locator('h1')).toHaveText('งานพัฒนาของฉัน');
  await expect(page.locator('#mw-urgent')).toHaveCount(1);
  const plan = page.locator('#mw-plan');
  await expect(plan).toContainText('สัปดาห์นี้');
  await expect(plan.locator('.plan-day.today')).toHaveCount(1);
  await expect(plan.locator('.plan-day')).toHaveCount(await plan.locator('.plan-day').count());
  expect(await plan.locator('.plan-day').count()).toBeGreaterThanOrEqual(5);
  await page.getByRole('button', { name: 'สัปดาห์ถัดไป' }).click();
  await expect(plan.locator('.plan-range')).toContainText('สัปดาห์หน้า');
  await expect(plan.locator('.plan-day.today')).toHaveCount(0);
  await page.getByRole('button', { name: 'กลับสัปดาห์นี้' }).click();
  await expect(plan.locator('.plan-range')).toContainText('สัปดาห์นี้');
  await page.getByRole('link', { name: 'ดูงานที่ฉันดูแล (PM) →' }).click();
  await expect(page).toHaveURL(/my-work\/pm$/);
  await expect(page.locator('h1')).toHaveText('งานที่ฉันดูแล (PM)');
  await expect(page.locator('#mw-plan')).toHaveCount(0);
});

test('My Work: pick any status from the card, not only the next step (2026-11-11)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ehp.myname.v1', JSON.stringify('นักพัฒนา แดง')));
  await open(page, '/#/my-work');
  const form = page.locator('.qs-form').first();
  const id = await form.getAttribute('data-id');
  await form.locator('select').selectOption('ส่งกลับนักพัฒนาแก้ไข');
  await form.getByRole('button', { name: 'เปลี่ยนสถานะ' }).click();
  await expect(page.locator('.toast').first()).toContainText('บันทึกการแก้ไขแล้ว (สถานะ)');
  const row = await page.evaluate((s) => window.__mockSheet.rows.find((r) => r.seq === s), id);
  expect(row.status).toBe('ส่งกลับนักพัฒนาแก้ไข');
  // labels hide "0." but values stay exact
  const values = await page
    .locator('.qs-form')
    .first()
    .locator('option')
    .evaluateAll((o) => o.map((x) => x.value));
  expect(values).toContain('0.แก้ไขเรียบร้อย');
});
