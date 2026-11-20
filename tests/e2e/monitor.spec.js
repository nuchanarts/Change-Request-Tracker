import { test, expect } from '@playwright/test';
import { open, expectedMetrics, statValue } from './helpers.js';

const n = (s) => Number(String(s).replace(/[^\d]/g, ''));

test.describe('US1 Monitor', () => {
  test('numbers match the shared Domain definitions', async ({ page }) => {
    await open(page);
    const exp = await expectedMetrics(page);
    expect(n(await statValue(page, 'open').textContent())).toBe(exp.open);
    expect(n(await statValue(page, 'overdue').textContent())).toBe(exp.overdue);
    expect(n(await statValue(page, 'closed-week').textContent())).toBe(exp.week);
    expect(n(await statValue(page, 'closed-month').textContent())).toBe(exp.month);
  });

  test('pipeline shows every open workflow step and highlights the bottleneck', async ({ page }) => {
    await open(page);
    await expect(page.locator('.stage')).toHaveCount(12);
    await expect(page.locator('.stage.bottleneck')).toHaveCount(1);
  });

  // "ตัวหนังสือมันตก" + "ตัด 0. ออก" (user, 2026-11-20)
  test('stage numbers line up, names never overflow, and no "0." prefix is shown', async ({ page }, info) => {
    await open(page);
    const boxes = await page.locator('.stage').evaluateAll((els) =>
      els.map((el) => {
        const c = el.querySelector('.count').getBoundingClientRect();
        const box = el.getBoundingClientRect();
        const nm = el.querySelector('.name');
        // offset inside its own box, so a two-row layout still counts as lined up
        return {
          top: Math.round(c.top - box.top),
          over: nm.scrollWidth - nm.clientWidth,
          text: nm.textContent,
        };
      }),
    );
    if (info.project.name !== 'mobile-375') expect(new Set(boxes.map((b) => b.top)).size).toBe(1);
    for (const b of boxes) {
      expect(b.over, b.text).toBeLessThanOrEqual(1);
      expect(b.text).not.toMatch(/^0./);
    }
    await expect(page.locator('.pipeline')).not.toContainText('"0.');
    // "ให้คำขึ้นสองบรรทัด สวยๆ" (user, 2026-11-20): on desktop every step name is two whole lines, none cut off
    if (info.project.name !== 'mobile-375') {
      const lines = await page.locator('.stage .name').evaluateAll((els) =>
        els.map((el) =>
          [...el.querySelectorAll('.line')].map((l) => ({
            t: l.textContent,
            cut: l.scrollWidth > l.clientWidth + 1,
          })),
        ),
      );
      for (const l of lines) {
        expect(l.length, JSON.stringify(l)).toBe(2);
        for (const x of l) expect(x.cut, x.t).toBe(false);
      }
    }
    await expect(page.locator('.hero')).not.toContainText('"0.');
  });

  test('drill-down list size equals the clicked number', async ({ page }) => {
    await open(page);
    const overdue = n(await statValue(page, 'overdue').textContent());
    await page.locator('[data-metric="overdue"] button').click();
    await expect(page).toHaveURL(/#\/items$/);
    await expect(page.locator('.drill')).toContainText(`(${overdue} รายการ)`);
    await expect(page.locator('.page-head .muted').first()).toContainText(String(overdue));
  });

  test('filters recompute every number', async ({ page }) => {
    await open(page);
    await page.selectOption('#f-platform', 'NHIP');
    const exp = await expectedMetrics(page, { platform: ['NHIP'] });
    await expect(statValue(page, 'open')).toHaveText(exp.open.toLocaleString('th-TH'));
    await expect(statValue(page, 'overdue')).toHaveText(exp.overdue.toLocaleString('th-TH'));
  });

  test('data-quality panel lists rows with wrong-column values', async ({ page }) => {
    await open(page);
    const panel = page.locator('[data-panel="quality"]');
    await expect(panel).toContainText('รายการ');
    await expect(panel).toContainText('แพลตฟอร์ม');
  });

  test('shows a clear error when the sheet cannot be opened', async ({ page }) => {
    await open(page, '/?fail=bootstrap');
    await expect(page.getByRole('alert')).toContainText('ไม่มีสิทธิ์เปิดชีต');
    await expect(page.getByRole('button', { name: 'ลองอีกครั้ง' })).toBeVisible();
  });
});
