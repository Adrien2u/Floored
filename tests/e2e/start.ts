/**
 * Getting into the workspace.
 *
 * The app opens on the template picker, so every test that exercises the editor
 * starts by choosing a plan — which is also the first thing a real user does.
 */

import { expect, type Page } from '@playwright/test';

/** Open the app and start a wedding plan named for the export tests. */
export async function startPlan(page: Page, name = 'Spring Gala'): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('start-screen')).toBeVisible();

  await page.getByTestId('start-name').fill(name);
  await chooseTemplate(page, 'wedding');
}

/**
 * Pick a template, and click again if the first press did nothing.
 *
 * Svelte attaches its delegated listener on the root as part of mounting, and
 * Playwright will happily click the instant the button lands in the DOM — a
 * window of a few milliseconds where the press goes nowhere. A person cannot
 * hit it; an automated click can, and did, on Firefox about one run in three.
 */
export async function chooseTemplate(page: Page, id: string): Promise<void> {
  const button = page.getByTestId(`template-${id}`);
  const canvas = page.getByTestId('canvas-host');

  await button.click();

  try {
    await canvas.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    await button.click();
    await expect(canvas).toBeVisible({ timeout: 20_000 });
  }
}
