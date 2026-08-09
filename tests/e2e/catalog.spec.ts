/**
 * Catalog placement and the capacity readout.
 *
 * These cover the parts a professional would check first: that the objects
 * carry the right seat counts, and that the clearance and occupant-load
 * warnings actually fire on a plan that deserves them.
 */

import { test, expect, type Page } from '@playwright/test';

async function seats(page: Page): Promise<number> {
  return Number.parseInt((await page.getByTestId('seat-count').textContent()) ?? '0', 10);
}

async function elements(page: Page): Promise<number> {
  return Number.parseInt((await page.getByTestId('element-count').textContent()) ?? '0', 10);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas-host')).toBeVisible();
});

test('placing a 60-inch round adds eight seats', async ({ page }) => {
  const before = await seats(page);

  await page.getByTestId('catalog-round-60').click();

  expect(await seats(page)).toBe(before + 8);
});

test('a 72-inch round seats ten, and a 48-inch seats six', async ({ page }) => {
  const start = await seats(page);

  await page.getByTestId('catalog-round-72').click();
  expect(await seats(page)).toBe(start + 10);

  await page.getByTestId('catalog-round-48').click();
  expect(await seats(page)).toBe(start + 16);
});

test('a ceremony block adds 48 seats as one element', async ({ page }) => {
  // The point of ADR-0012: 48 chairs, one element.
  const beforeSeats = await seats(page);
  const beforeElements = await elements(page);

  await page.getByTestId('catalog-ceremony-block').click();

  expect(await seats(page)).toBe(beforeSeats + 48);
  expect(await elements(page)).toBe(beforeElements + 1);
});

test('a theatre block adds 120 seats as one element', async ({ page }) => {
  const beforeSeats = await seats(page);
  const beforeElements = await elements(page);

  await page.getByTestId('catalog-theatre-block').click();

  expect(await seats(page)).toBe(beforeSeats + 120);
  expect(await elements(page)).toBe(beforeElements + 1);
});

test('a dancefloor adds no seats', async ({ page }) => {
  const before = await seats(page);
  await page.getByTestId('catalog-dancefloor-16').click();
  expect(await seats(page)).toBe(before);
});

test('a placed item is selected, ready to move', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await expect(page.getByTestId('duplicate')).toBeEnabled();
});

test('placing is undoable', async ({ page }) => {
  const before = await elements(page);

  await page.getByTestId('catalog-round-60').click();
  expect(await elements(page)).toBe(before + 1);

  await page.getByTestId('undo').click();
  expect(await elements(page)).toBe(before);
});

test('the occupant load reflects the room area', async ({ page }) => {
  // The sample ballroom is 60 x 40 ft = 2400 sq ft; at 15 sq ft per person
  // unconcentrated, NFPA 101 gives 160.
  await expect(page.getByTestId('occupant-load')).toContainText('160');
  await expect(page.getByTestId('occupant-load')).toContainText('2400 sq ft');
});

test('stacking seats past the occupant load raises a warning', async ({ page }) => {
  await expect(page.getByTestId('over-capacity')).toHaveCount(0);

  // Each theatre block is 120 seats; two of them take a 160-person room well
  // past its estimated load.
  await page.getByTestId('catalog-theatre-block').click();
  await page.getByTestId('catalog-theatre-block').click();

  await expect(page.getByTestId('over-capacity')).toBeVisible();
  await expect(page.getByTestId('over-capacity')).toContainText('160');
});

test('placing two tables on the same spot reports a clearance problem', async ({ page }) => {
  await expect(page.getByTestId('clearance')).toHaveText('Clear');

  // Both land at the centre of the view, so their gap is negative.
  await page.getByTestId('catalog-round-60').click();
  await page.getByTestId('catalog-round-60').click();

  await expect(page.getByTestId('clearance')).toContainText('too tight');
  await expect(page.getByTestId('issue-list')).toBeVisible();
});

test('the clearance warning names the required distance in readable units', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await page.getByTestId('catalog-round-60').click();

  // The sourced minimum between rounds is 54 inches, which a planner reads as
  // 4 feet 6 inches — the app formats imperial the way plans are dimensioned.
  await expect(page.getByTestId('issue-list')).toContainText(`4' 6"`);
});

test('warnings name elements, never raw ids', async ({ page }) => {
  // An opaque UUID in a warning looks like a fault in the software rather than
  // a fault in the plan.
  await page.getByTestId('catalog-round-60').click();
  await page.getByTestId('catalog-round-60').click();

  const text = (await page.getByTestId('issue-list').textContent()) ?? '';
  expect(text).toContain('round table');
  expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
});

test('overlapping objects say so, rather than showing a negative distance', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await page.getByTestId('catalog-round-60').click();

  await expect(page.getByTestId('issue-list')).toContainText('Overlapping');
  // A negative measurement asks the reader to work out what it means.
  await expect(page.getByTestId('issue-list')).not.toContainText('-');
});

test('undoing a placement clears the warning it caused', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await page.getByTestId('catalog-round-60').click();
  await expect(page.getByTestId('clearance')).toContainText('too tight');

  await page.getByTestId('undo').click();
  await expect(page.getByTestId('clearance')).toHaveText('Clear');
});
