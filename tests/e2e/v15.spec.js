import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test.describe('Navigation order, Taiga link, access admin (2026-11-11)', () => {
  test('top menu is in the requested order with Taiga and admin links', async ({ page }) => {
    await open(page);
    const names = await page.locator('.nav a:visible').allTextContents();
    expect(names).toEqual([
      'ภาพรวม',
      'เพิ่มรายการ',
      'บอร์ดงาน',
      'งานของฉัน',
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
    await expect(page.locator('#mw-next h2')).toContainText('สัปดาห์หน้า');
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
    const pm = await page.locator('#f-rep-pm option').nth(1).textContent();
    await page.selectOption('#f-rep-pm', pm);
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(text).toHaveValue(new RegExp('PM ผู้รับผิดชอบ: ' + escapeRe(pm)));
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
  await expect(page.getByRole('link', { name: 'สลับบัญชี Google' })).toBeVisible();
});
