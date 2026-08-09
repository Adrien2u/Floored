/**
 * The first minute.
 *
 * The research said a plan has to be usable inside a minute or the tool loses
 * to copy-paste in another program. That claim is what these check: pick an
 * arrangement, give it a room, and be editing.
 */

import { test, expect } from '@playwright/test';
import { startPlan } from './start';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('opens on the template picker, not on somebody else\u2019s plan', async ({ page }) => {
  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('canvas-host')).toBeHidden();
});

test('a template produces a plan with tables already in it', async ({ page }) => {
  await page.getByTestId('template-wedding').click();

  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect(page.getByTestId('element-count')).not.toHaveText('0 elements');
  await expect(page.getByTestId('seat-count')).not.toHaveText('0');
});

test('the room size given is the room drawn', async ({ page }) => {
  await page.getByTestId('start-width').fill('100');
  await page.getByTestId('start-depth').fill('80');
  await expect(page.getByTestId('start-room-size')).toContainText('100');

  await page.getByTestId('template-gala').click();

  // A bigger room fits more tables than the 60 × 40 default.
  const seats = Number.parseInt((await page.getByTestId('seat-count').textContent()) ?? '0', 10);
  expect(seats).toBeGreaterThan(100);
});

test('the event name reaches the export', async ({ page }) => {
  await page.getByTestId('start-name').fill('Ruth and Sam');
  await page.getByTestId('template-cabaret').click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('Ruth-and-Sam.floored');
});

test('an empty plan is offered for people who want to draw their own room', async ({ page }) => {
  await page.getByTestId('template-blank').click();

  await expect(page.getByTestId('canvas-host')).toBeVisible();
  await expect(page.getByTestId('element-count')).toHaveText('0 elements');
});

test('a template with no clearance problems opens without a warning', async ({ page }) => {
  await page.getByTestId('template-gala').click();
  await expect(page.getByTestId('clearance-warnings')).toBeHidden();
});

test('you can go back and start a different plan', async ({ page }) => {
  await startPlan(page);
  await page.getByTestId('start-over').click();

  await expect(page.getByTestId('start-screen')).toBeVisible();
});
