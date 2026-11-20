import { test, expect } from '@playwright/test';
import { open } from './helpers.js';

// "รายละเอียด * อยากให้เด่นๆ กว่านี้" (user, 2026-11-20)
test('รายละเอียด stands out from the other fields', async ({ page }) => {
  await open(page, '/#/items/8');
  const detail = page.locator('.field-feature');
  await expect(detail).toHaveCount(1);
  await expect(detail.locator('textarea')).toHaveAttribute('name', 'detail');
  const css = await page.evaluate(() => {
    const px = (el, p) => parseFloat(getComputedStyle(el)[p]);
    const d = document.querySelector('.field-feature');
    const other = document.querySelector('#f-system').closest('.field');
    return {
      label: px(d.querySelector('label'), 'fontSize'),
      otherLabel: px(other.querySelector('label'), 'fontSize'),
      text: px(d.querySelector('textarea'), 'fontSize'),
      otherText: px(other.querySelector('input'), 'fontSize'),
      height: d.querySelector('textarea').getBoundingClientRect().height,
      bg: getComputedStyle(d).backgroundColor,
    };
  });
  expect(css.label).toBeGreaterThan(css.otherLabel);
  expect(css.text).toBeGreaterThan(css.otherText);
  expect(css.height).toBeGreaterThanOrEqual(120);
  expect(css.bg).not.toBe('rgba(0, 0, 0, 0)');
});
