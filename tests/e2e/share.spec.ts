/**
 * Sharing a plan.
 *
 * The second-ranked complaint in the research was that sharing is broken:
 * export a PDF and email it, or share something the client can silently change.
 * A link that carries the plan in its own fragment answers both — so these
 * check that it round-trips, that it never reaches a server, and that the
 * recipient is plainly told they hold a copy.
 */

import { test, expect, type Page } from '@playwright/test';
import { startPlan } from './start';

/**
 * Record what the app copies, without needing clipboard permissions.
 *
 * Reading the real clipboard back needs a permission each engine gates
 * differently — and WebKit rejects the permission name outright, which then
 * breaks every later test in the file. Recording the write is engine-neutral
 * and still exercises the app's own code path.
 */
async function captureClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorded: string[] = [];
    Object.defineProperty(window, '__copied', { get: () => recorded });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          recorded.push(text);
          return Promise.resolve();
        },
      },
    });
  });
}

function lastCopied(page: Page): Promise<string> {
  return page.evaluate(() => {
    const copied = (window as unknown as { __copied: string[] }).__copied;
    return copied[copied.length - 1] ?? '';
  });
}

test('a share link carries the plan to a fresh browser', async ({ page, context }) => {
  await captureClipboard(page);
  await startPlan(page, 'Ruth and Sam');
  const seats = await page.getByTestId('seat-count').textContent();

  await page.getByTestId('share-link').click();
  await expect(page.getByTestId('file-message')).toContainText('Link copied');

  const url = await lastCopied(page);
  expect(url).toContain('#plan=');

  const fresh = await context.newPage();
  await fresh.goto(url);

  await expect(fresh.getByTestId('shared-notice')).toBeVisible();
  await expect(fresh.getByTestId('canvas-host')).toBeVisible();
  await expect(fresh.getByTestId('seat-count')).toHaveText(seats ?? '');
  await fresh.close();
});

test('the plan travels in the fragment, which never reaches a server', async ({ page }) => {
  await captureClipboard(page);
  await startPlan(page);

  await page.getByTestId('share-link').click();
  await expect(page.getByTestId('file-message')).toContainText('Link copied');

  const [path, fragment] = (await lastCopied(page)).split('#');

  // Everything a host could log is the bare page URL.
  expect(path).not.toContain('plan=');
  expect(fragment?.startsWith('plan=')).toBe(true);
});

test('a damaged link is refused with a sentence, not a blank page', async ({ page }) => {
  await page.goto('/#plan=this-is-not-a-plan');

  await expect(page.getByTestId('share-error')).toContainText('damaged');
  // And the app is still usable: the picker is right there.
  await expect(page.getByTestId('start-screen')).toBeVisible();
});

test('a fragment that is not a share is ignored', async ({ page }) => {
  await page.goto('/#section-two');

  await expect(page.getByTestId('start-screen')).toBeVisible();
  await expect(page.getByTestId('share-error')).toBeHidden();
});
