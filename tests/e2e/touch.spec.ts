/**
 * Using the app with fingers.
 *
 * A planner checks a layout standing in the venue, on a tablet. There is no
 * wheel and no keyboard there, so pinch is the only way to zoom — and a plan
 * that cannot be zoomed cannot be checked.
 *
 * Driven through CDP touch events, which is the only way to synthesise two
 * simultaneous pointers. Chromium only for that reason; the code under test is
 * plain Pointer Events with no engine-specific paths.
 */

import { test, expect, type Page } from '@playwright/test';
import { startPlan } from './start';

test.skip(({ browserName }) => browserName !== 'chromium', 'needs CDP touch synthesis');
test.use({ hasTouch: true });

interface Touch {
  x: number;
  y: number;
  id: number;
}

/**
 * One CDP session for the whole gesture.
 *
 * Chromium tracks touch state per session, so a fresh session per event is
 * refused with "Must send a TouchStart first" — the second event belongs to a
 * sequence the new session never saw begin.
 */
async function fingers(page: Page) {
  const client = await page.context().newCDPSession(page);

  return {
    async send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: Touch[]) {
      await client.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id })),
      });
    },
    detach: () => client.detach(),
  };
}

/** The scale the plan is currently drawn at, read off the app's own state. */
async function scale(page: Page): Promise<number> {
  return page.evaluate(() => {
    const host = document.querySelector('[data-testid=canvas-host]');
    return Number(host?.getAttribute('data-scale') ?? '0');
  });
}

test('two fingers spreading zooms the plan in', async ({ page }) => {
  await startPlan(page);
  const box = await page.getByTestId('canvas-host').boundingBox();
  if (!box) throw new Error('no canvas');
  const hand = await fingers(page);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = await scale(page);
  expect(before).toBeGreaterThan(0);

  await hand.send('touchStart', [
    { x: cx - 40, y: cy, id: 1 },
    { x: cx + 40, y: cy, id: 2 },
  ]);
  await hand.send('touchMove', [
    { x: cx - 120, y: cy, id: 1 },
    { x: cx + 120, y: cy, id: 2 },
  ]);
  await hand.send('touchEnd', []);

  await expect.poll(() => scale(page)).toBeGreaterThan(before * 1.5);
});

test('two fingers pinching zooms the plan out', async ({ page }) => {
  await startPlan(page);
  const box = await page.getByTestId('canvas-host').boundingBox();
  if (!box) throw new Error('no canvas');
  const hand = await fingers(page);

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const before = await scale(page);

  await hand.send('touchStart', [
    { x: cx - 150, y: cy, id: 1 },
    { x: cx + 150, y: cy, id: 2 },
  ]);
  await hand.send('touchMove', [
    { x: cx - 50, y: cy, id: 1 },
    { x: cx + 50, y: cy, id: 2 },
  ]);
  await hand.send('touchEnd', []);

  await expect.poll(() => scale(page)).toBeLessThan(before);
});

test('a pinch does not move the furniture it started on', async ({ page }) => {
  await startPlan(page);
  const box = await page.getByTestId('canvas-host').boundingBox();
  if (!box) throw new Error('no canvas');
  const hand = await fingers(page);

  const before = await page.getByTestId('element-count').textContent();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.75;

  // The first finger lands on a table; the second turns it into a pinch.
  await hand.send('touchStart', [{ x: cx, y: cy, id: 1 }]);
  await hand.send('touchStart', [
    { x: cx, y: cy, id: 1 },
    { x: cx + 80, y: cy, id: 2 },
  ]);
  await hand.send('touchMove', [
    { x: cx - 60, y: cy, id: 1 },
    { x: cx + 160, y: cy, id: 2 },
  ]);
  await hand.send('touchEnd', []);

  await expect(page.getByTestId('element-count')).toHaveText(before ?? '');
  // Nothing was dragged, so there is nothing to undo.
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('one finger still drags, so pinch did not cost the ordinary gesture', async ({ page }) => {
  await startPlan(page);
  const box = await page.getByTestId('canvas-host').boundingBox();
  if (!box) throw new Error('no canvas');
  const hand = await fingers(page);

  const before = await scale(page);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await hand.send('touchStart', [{ x: cx, y: cy, id: 1 }]);
  await hand.send('touchMove', [{ x: cx + 40, y: cy + 20, id: 1 }]);
  await hand.send('touchEnd', []);

  // A single finger never zooms.
  expect(await scale(page)).toBeCloseTo(before, 6);
});
