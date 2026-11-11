import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { open } from './helpers.js';

const pages = ['/#/monitor', '/#/kanban', '/#/items', '/#/new', '/#/my-work', '/#/help'];

for (const path of pages) {
  test(`no serious accessibility issues and no sideways scroll: ${path}`, async ({ page }) => {
    await open(page, path);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = result.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('first-run tour can be skipped and replayed from help', async ({ page }) => {
  await open(page, '/', { tour: true });
  await expect(page.getByRole('dialog')).toContainText('ยินดีต้อนรับ');
  await page.getByRole('button', { name: 'ข้าม' }).click();
  await expect(page.locator('.tour')).toHaveCount(0);
  await page.goto('/#/help');
  await page.getByRole('button', { name: 'ดูทัวร์แนะนำอีกครั้ง' }).click();
  await expect(page.getByRole('dialog')).toContainText('ขั้นที่ 1 จาก 4');
});
