/**
 * Working with no network.
 *
 * The claim on the front of the project is that this runs offline, with no
 * account and no server. That claim is only worth making if it is checked, so
 * this loads the app, cuts the network entirely, and reloads.
 *
 * Chromium only: Playwright's service-worker support is not uniform across
 * engines, and a red test that means "the harness cannot see the worker" is
 * worse than no test. The worker itself is plain, versionless DOM API.
 */

import { test, expect } from '@playwright/test';

test.describe('offline', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'service worker harness support');

  test('opens with the network disabled once the shell is cached', async ({ page, context }) => {
    await page.goto('/');
    await expect(page.getByTestId('start-screen')).toBeVisible();

    // Wait for the worker to take control, which is when the cache is complete.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 15_000,
    });

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByTestId('start-screen')).toBeVisible();

    // Not merely the shell: a template has to produce a real plan offline.
    await page.getByTestId('template-wedding').click();
    await expect(page.getByTestId('canvas-host')).toBeVisible();
    await expect(page.getByTestId('seat-count')).not.toHaveText('0');

    await context.setOffline(false);
  });

  test('exports a PDF offline, which is the whole point of a venue basement', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, {
      timeout: 15_000,
    });

    await context.setOffline(true);
    await page.reload();
    await page.getByTestId('template-gala').click();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-pdf').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename().endsWith('.pdf')).toBe(true);
    await context.setOffline(false);
  });

  test('serves a manifest with installable icons', async ({ page }) => {
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);

    const manifest = (await response.json()) as {
      name: string;
      start_url: string;
      display: string;
      icons: { sizes: string; purpose: string }[];
    };

    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map((i) => i.sizes)).toContain('512x512');
    // Android crops installed icons into a circle; without a maskable icon the
    // room walls get shaved off.
    expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);

    for (const name of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
      expect((await page.request.get(`/${name}`)).ok()).toBe(true);
    }
  });

  test('the worker precaches the built assets rather than globbing at runtime', async ({
    page,
  }) => {
    const source = await (await page.request.get('/sw.js')).text();

    expect(source).toContain('"./"');
    expect(source).toMatch(/\.\/assets\/index-[\w-]+\.js/);
    // A silent reload mid-edit is data loss, so the worker must never take
    // over on its own: the one call to skipWaiting is the one the page asks
    // for.
    expect(source.match(/self\.skipWaiting\(\)/g)).toHaveLength(1);
    expect(source).toContain("if (event.data === 'SKIP_WAITING') self.skipWaiting();");
    // Source maps are large and never needed offline.
    expect(source).not.toMatch(/"[^"]+\.map"/);
  });
});
