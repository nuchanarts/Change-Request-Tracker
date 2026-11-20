import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "มอบหมายงาน อยากให้สามารถกดลิงค์ taiga ได้เลย" (user, 2026-11-20)
test('each มอบหมายงาน row links straight to its Taiga item in a new tab', async ({ page }) => {
  await open(page, '/#/assign');
  const want = await page.evaluate(() =>
    [...document.querySelectorAll('.as-row')].map((f) => {
      const D = window.Domain;
      const fx = window.__FIXTURE__;
      const raw = fx.rows.find((r) => String(r.seq) === f.getAttribute('data-id'));
      return D.enrich(raw, fx.today).ticketUrl;
    }),
  );
  expect(want.filter(Boolean).length).toBeGreaterThan(0);
  const rows = page.locator('.as-row');
  for (let i = 0; i < want.length; i++) {
    const link = rows.nth(i).locator('a.ticket-link');
    if (!want[i]) {
      await expect(link).toHaveCount(0);
      continue;
    }
    await expect(link).toHaveAttribute('href', want[i]);
    await expect(link).toHaveAttribute('target', '_blank');
  }
});
