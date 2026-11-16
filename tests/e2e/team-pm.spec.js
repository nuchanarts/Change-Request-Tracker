import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// The PM filter became grouped ("ทีม PM" + "รายคน", user request 2026-11-16). The team choices need the
// real PM nicknames, which the preview fixture does not use, so tests/unit/domain.teampm.test.js covers
// them; here we check single-PM filtering still works on every page with the shared filter bar.
for (const path of ['/#/monitor', '/#/items', '/#/kanban']) {
  test(`PM filter lists each PM under "รายคน" and filters by one PM: ${path}`, async ({ page }) => {
    await open(page, path);
    const pm = page.locator('#filters select[name="pm"]');
    const people = await page.evaluate(() => window.__FIXTURE__.options.pm);
    await expect(pm.locator('optgroup[label="รายคน"] option')).toHaveText(people);
    await pm.selectOption(people[0]);
    await expect(page.locator('#filters')).toHaveClass(/is-active/);
    await expect(page.locator('#filters select[name="pm"]')).toHaveValue(people[0]);
  });
}
