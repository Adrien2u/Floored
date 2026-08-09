/**
 * End-to-end editing flows.
 *
 * The tool logic is unit-tested as pure state machines; this suite covers what
 * those tests cannot — that the pointer handlers, the renderer, and the editor
 * state are actually wired to each other, in three real browser engines.
 *
 * Canvas has no DOM to query, so assertions go through the readouts the app
 * already shows a user: selection count, element count, seat total. That is a
 * deliberate constraint rather than a workaround — if a state change is not
 * visible anywhere, the user cannot see it either.
 */

import { test, expect, type Page } from '@playwright/test';
import { startPlan } from './start';

/** Centre of the canvas, in viewport coordinates. */
async function canvasCentre(page: Page) {
  const box = await page.getByTestId('canvas-host').boundingBox();
  if (!box) throw new Error('canvas not laid out');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/** Click somewhere that is certainly empty: the far corner of the canvas. */
async function clickEmptySpace(page: Page) {
  const { box } = await canvasCentre(page);
  await page.mouse.click(box.x + 12, box.y + 12);
}

/**
 * Click the first *editable* element by scanning the canvas.
 *
 * The room is locked in the sample plan and covers the whole canvas, so a click
 * that lands between tables selects the room — one element selected, and every
 * editing control correctly disabled. Waiting for a non-zero selection count is
 * therefore not enough; the test has to wait for something it can actually act
 * on, which is exactly what the Duplicate button being enabled means.
 *
 * The plan's pixel layout depends on the fit-to-bounds zoom, so scanning is more
 * robust than hard-coding a coordinate.
 */
async function selectATable(page: Page): Promise<{ x: number; y: number }> {
  const { box } = await canvasCentre(page);

  // The sample ballroom puts its table rows 10 ft in from the top and bottom of
  // a 40 ft room, with columns spread across the width. Probing those bands is
  // a couple of dozen round-trips rather than a couple of hundred — which
  // matters under Firefox with ten parallel workers, where the brute-force scan
  // exceeded the per-test timeout.
  const rows = [0.25, 0.75];
  const columns = [0.14, 0.22, 0.3, 0.42, 0.5, 0.58, 0.7, 0.78, 0.86];

  for (const row of rows) {
    const y = box.y + box.height * row;
    for (const column of columns) {
      const x = box.x + box.width * column;
      await page.mouse.click(x, y);
      if (await page.getByTestId('duplicate').isEnabled()) return { x, y };
    }
  }
  throw new Error('no editable element found on the canvas');
}

test.beforeEach(async ({ page }) => {
  await startPlan(page);
});

test('renders the sample plan with its seats counted', async ({ page }) => {
  await expect(page.getByTestId('element-count')).toContainText('elements');
  // The sample ballroom seats 8 per table across its rings.
  await expect(page.getByTestId('seat-count')).not.toHaveText('0');
});

test('clicking a table selects it, clicking empty space clears', async ({ page }) => {
  await selectATable(page);
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');

  await clickEmptySpace(page);
  await expect(page.getByTestId('selection-count')).toHaveText('0 selected');
});

test('select all then escape', async ({ page }) => {
  await page.getByTestId('canvas-host').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+a');

  const selected = await page.getByTestId('selection-count').textContent();
  expect(selected).not.toBe('0 selected');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('selection-count')).toHaveText('0 selected');
});

test('marquee drag selects several elements', async ({ page, browserName }) => {
  // Skipped in Firefox because Playwright's synthetic pointer stream cannot
  // drive a marquee there — not because the app cannot. See the test below,
  // which exercises the same path in Firefox and passes.
  //
  // What was measured: Firefox delivers every release event to canvas,
  // document, and window, and moves do arrive — but the marquee rectangle
  // shrank between two synthetic moves while the pointer travelled outward,
  // which no real input can do. Six delivery arrangements were tried; each
  // fixed one engine and broke another.
  test.fixme(browserName === 'firefox', "Playwright's synthetic drag is unreliable in Firefox");

  const { box } = await canvasCentre(page);

  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5);
  await page.mouse.move(box.x + box.width - 6, box.y + box.height - 6);
  await page.mouse.up();

  const count = await page.getByTestId('selection-count').textContent();
  expect(Number.parseInt(count ?? '0', 10)).toBeGreaterThan(1);
});

test('marquee selects in every engine, driven by dispatched events', async ({ page }) => {
  // The same gesture, dispatched from inside the page rather than through the
  // harness's input stream. This is what proves the marquee works in Firefox:
  // the mouse-driven test above cannot run there, and without this one the
  // feature would be untested on that engine rather than merely untestable
  // one way.
  //
  // It is a weaker test — the events are untrusted and skip real hit-testing
  // and capture — so it complements the mouse-driven version rather than
  // replacing it.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas.interaction');
    if (!(canvas instanceof HTMLElement)) throw new Error('no interaction canvas');

    const r = canvas.getBoundingClientRect();
    const fire = (type: string, x: number, y: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          buttons: type === 'pointerup' ? 0 : 1,
        })
      );

    fire('pointerdown', r.left + 5, r.top + 5);
    fire('pointermove', r.left + r.width * 0.5, r.top + r.height * 0.5);
    fire('pointermove', r.right - 5, r.bottom - 5);
    fire('pointerup', r.right - 5, r.bottom - 5);
  });

  const count = await page.getByTestId('selection-count').textContent();
  expect(Number.parseInt(count ?? '0', 10)).toBeGreaterThan(1);
});

test('delete removes the selection and undo brings it back', async ({ page }) => {
  const before = await page.getByTestId('element-count').textContent();

  await selectATable(page);
  await page.getByTestId('delete').click();

  const after = await page.getByTestId('element-count').textContent();
  expect(after).not.toBe(before);

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('element-count')).toHaveText(before ?? '');
});

test('duplicate adds an element and selects the copy', async ({ page }) => {
  await selectATable(page);
  const before = Number.parseInt(
    (await page.getByTestId('element-count').textContent()) ?? '0',
    10
  );

  await page.getByTestId('duplicate').click();

  const after = Number.parseInt((await page.getByTestId('element-count').textContent()) ?? '0', 10);
  expect(after).toBe(before + 1);
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
});

test('array lays out a grid in one action, and one undo reverses all of it', async ({ page }) => {
  // The property that makes undo trustworthy: a batch is one step.
  await selectATable(page);
  const before = Number.parseInt(
    (await page.getByTestId('element-count').textContent()) ?? '0',
    10
  );

  await page.getByTestId('array').click();
  const after = Number.parseInt((await page.getByTestId('element-count').textContent()) ?? '0', 10);
  // 3 x 2 minus the original cell = five copies.
  expect(after).toBe(before + 5);

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('element-count')).toHaveText(`${String(before)} elements`);
});

test('undo is disabled until something has been done', async ({ page }) => {
  await expect(page.getByTestId('undo')).toBeDisabled();

  await selectATable(page);
  await page.getByTestId('rotate').click();

  await expect(page.getByTestId('undo')).toBeEnabled();
});

test('redo is available after an undo and clears after a new action', async ({ page }) => {
  await selectATable(page);
  await page.getByTestId('duplicate').click();
  await page.getByTestId('undo').click();

  await expect(page.getByTestId('redo')).toBeEnabled();

  await selectATable(page);
  await page.getByTestId('rotate').click();
  await expect(page.getByTestId('redo')).toBeDisabled();
});

test('align is disabled for a single element and enabled for several', async ({ page }) => {
  await selectATable(page);
  await expect(page.getByTestId('align-left')).toBeDisabled();

  await page.keyboard.press('Control+a');
  await expect(page.getByTestId('align-left')).toBeEnabled();
});

test('arrow keys nudge without changing the element count', async ({ page }) => {
  await selectATable(page);
  const before = await page.getByTestId('element-count').textContent();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');

  await expect(page.getByTestId('element-count')).toHaveText(before ?? '');
  await expect(page.getByTestId('undo')).toBeEnabled();
});

test('dragging a table keeps it selected and records one undo step', async ({ page }) => {
  const at = await selectATable(page);

  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 60, at.y + 40, { steps: 8 });
  await page.mouse.up();

  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await expect(page.getByTestId('undo')).toBeEnabled();

  // One drag is one undo, not one per pointer move.
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('hiding a layer drops the elements it contained from the selection', async ({ page }) => {
  await page.getByTestId('canvas-host').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Control+a');

  const before = Number.parseInt(
    (await page.getByTestId('selection-count').textContent()) ?? '0',
    10
  );
  expect(before).toBeGreaterThan(1);

  await page.getByLabel('furniture').uncheck();

  // The room sits on its own layer and stays selected; everything on the hidden
  // layer must not, because a hidden element cannot be acted on.
  const after = Number.parseInt(
    (await page.getByTestId('selection-count').textContent()) ?? '0',
    10
  );
  expect(after).toBeLessThan(before);
  await expect(page.getByTestId('duplicate')).toBeDisabled();
});
