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
  await page.getByTestId('template-wedding').click();

  await expect(page.getByTestId('canvas-host')).toBeVisible();
}
