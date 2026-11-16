import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

test('help page shows the team SOP with status rules and RACI', async ({ page }) => {
  await open(page, '/#/help');
  const sop = page.locator('#sop');
  await expect(sop.getByRole('heading', { name: /SOP/ })).toBeVisible();
  await expect(sop.locator('#sop-status tbody tr')).toHaveCount(14);
  await expect(sop.locator('#sop-raci')).toContainText('Senior Dev');
  // in-page table of contents jumps without leaving the app
  await page.getByRole('link', { name: 'ดู SOP การทำงานของทีม' }).click();
  await expect(sop).toBeInViewport();
});
