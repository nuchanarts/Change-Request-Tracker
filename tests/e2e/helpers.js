import { expect } from '@playwright/test';

/** Open the app with the onboarding tour already seen, wait until data is rendered. */
export async function open(page, path = '/', { tour = false } = {}) {
  if (!tour) await page.addInitScript(() => localStorage.setItem('ehp.tour.v1', 'true'));
  await page.goto(path);
  await expect(page.locator('.loading')).toHaveCount(0);
}

/** Compute expected monitor metrics in the page with the same Domain module and fixture. */
export function expectedMetrics(page, filters = {}) {
  return page.evaluate((f) => {
    const D = window.Domain;
    const fx = window.__FIXTURE__;
    const rows = fx.rows.filter((r) => String(r.detail).trim()).map((r) => D.enrich(r, fx.today));
    const m = D.computeMetrics(D.applyFilters(rows, f), fx.today);
    return {
      open: m.openCount,
      overdue: m.overdueCount,
      week: m.closedThisWeek.count,
      month: m.closedThisMonth.count,
    };
  }, filters);
}

export const statValue = (page, metric) => page.locator(`[data-metric="${metric}"] .value`);
