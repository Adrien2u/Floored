/**
 * Small screens.
 *
 * The tablet case is the one that happens in a venue: a planner standing in the
 * room with the plan in their hands. A layout that overflows sideways there is
 * not a cosmetic problem — it hides the controls behind a scroll nobody thinks
 * to try.
 */

import { test, expect, type Page } from '@playwright/test';
import { startPlan } from './start';

const SIZES = [
  { name: 'phone', width: 375, height: 667 },
  { name: 'tablet portrait', width: 768, height: 1024 },
  { name: 'tablet landscape', width: 1024, height: 768 },
  { name: 'laptop', width: 1440, height: 900 },
];

/** How far the page can be scrolled sideways. Anything above zero is a bug. */
function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
}

for (const size of SIZES) {
  test(`the plan and its panels fit a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await startPlan(page);

    await expect(page.getByTestId('canvas-host')).toBeVisible();
    await expect(page.getByTestId('guest-search')).toBeVisible();

    // A pixel or two of rounding is not a layout failure; a column is.
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
  });

  test(`the start screen fits a ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');

    await expect(page.getByTestId('template-wedding')).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(2);
  });
}

test('the canvas keeps a usable height on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await startPlan(page);

  const box = await page.getByTestId('canvas-host').boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(200);
  expect(box?.width ?? 0).toBeGreaterThan(300);
});
