import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open } from './helpers.js';

// "สรุปรายงานประจำวัน" on หน้าหลัก (user request 2026-11-26)
const text = (page) => page.locator('#daily-text');

test('a status change made today is in the daily report; copy and pick another day', async ({ page }) => {
  await open(page, '/#/monitor');
  // change one open item's status through the normal form
  const seq = await page.evaluate(() => {
    const D = window.Domain;
    return window.__mockSheet.rows.find((r) => D.isOpen(r.status) && /^\d+$/.test(r.seq) && r.detail).seq;
  });
  await page.goto('/#/items/' + seq);
  await page.locator('#f-status').selectOption('กำลังทดสอบ');
  await page.locator('#save-btn').click();
  await expect(page.locator('.toast').last()).toContainText('บันทึกการแก้ไขแล้ว');

  await page.goto('/#/monitor');
  await page.getByRole('button', { name: 'สรุปรายงานประจำวัน' }).click();
  await expect(text(page)).toHaveValue(/วันที่ปฏิบัติงาน :/);
  const value = await text(page).inputValue();
  const head = value.match(/วันที่ปฏิบัติงาน : (\S+)/)[1];
  expect(value).toContain('สรุปการดำเนินการ :');
  expect(value).toContain('รายละเอียดการดำเนินการ :');
  expect(value).toContain('#' + seq);
  expect(value).toMatch(/สถานะ: .+ → กำลังทดสอบ \(ชีต/);
  expect(value).toContain('สรุปสิ่งที่แก้ไขในสัปดาห์นี้');
  const axe = await new AxeBuilder({ page }).include('#dialog').analyze();
  expect(axe.violations.filter((v) => ['serious', 'critical'].includes(v.impact))).toEqual([]);

  await page
    .context()
    .grantPermissions(['clipboard-read', 'clipboard-write'])
    .catch(() => {});
  await page.getByRole('button', { name: 'คัดลอกข้อความ' }).click();
  await expect(page.locator('.toast').last()).toContainText(/คัดลอก|Ctrl\+C/);

  // the day before: its own date, without today's sheet change
  const prev = await page.evaluate(() => {
    const D = window.Domain;
    return D.toIso(D.addDays(window.__FIXTURE__.today, -1));
  });
  await page.locator('#daily-date').fill(prev);
  await expect(text(page)).not.toHaveValue(new RegExp('วันที่ปฏิบัติงาน : ' + head));
  expect(await text(page).inputValue()).not.toMatch(/→ กำลังทดสอบ \(ชีต/);
});
