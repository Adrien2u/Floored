/**
 * Guest import and seating.
 *
 * The research ranked seating as the single biggest complaint about existing
 * tools, and named two specific failures: assignment is clumsy, and it takes
 * constant tool-switching. So these tests exercise the two interactions that
 * answer those — click-to-place and auto-assign — rather than only the model,
 * which the unit suite already covers.
 */

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const GUESTS_CSV = fileURLToPath(new URL('../fixtures/guests.csv', import.meta.url));

/** Import the fixture, keeping anyone the file omits. */
async function importGuests(page: Page): Promise<void> {
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(GUESTS_CSV);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await page.getByTestId('import-keep').click();
  await expect(page.getByTestId('import-preview')).toBeHidden();
}

function seatedCount(page: Page) {
  return page.getByTestId('seated-count');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas-host')).toBeVisible();
});

test('importing a CSV previews before it changes anything', async ({ page }) => {
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(GUESTS_CSV);

  const preview = page.getByTestId('import-preview');
  await expect(preview).toContainText('4 added');

  // Cancelling must leave the plan untouched — the point of a preview.
  await page.getByTestId('import-cancel').click();
  await expect(seatedCount(page)).toContainText('0/0');
});

test('a quoted comma in a name survives the import', async ({ page }) => {
  await importGuests(page);
  await expect(seatedCount(page)).toContainText('0/4');
  await expect(page.getByTestId('guest-list')).toContainText('Van Rijn, Rembrandt');
});

test('search narrows the list and says so when nothing matches', async ({ page }) => {
  await importGuests(page);

  await page.getByTestId('guest-search').fill('hokusai');
  await expect(page.getByTestId('guest-list')).toContainText('Hokusai');
  await expect(page.getByTestId('guest-list')).not.toContainText('Ada');

  await page.getByTestId('guest-search').fill('nobody by that name');
  await expect(page.getByTestId('no-results')).toBeVisible();
});

test('click-to-place seats a guest without dragging', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await importGuests(page);

  await page.getByRole('button', { name: 'Ada Lovelace' }).click();
  await expect(page.getByTestId('pending-guest')).toContainText('Ada Lovelace');

  // The table was placed at the centre of the view, so that is where it is.
  const canvas = page.getByTestId('canvas-host');
  await canvas.click({ position: await centre(canvas) });

  await expect(page.getByTestId('pending-guest')).toBeHidden();
  await expect(seatedCount(page)).toContainText('1/4');
  await expect(page.getByTestId('table-detail')).toContainText('Ada Lovelace');
});

test('auto-assign fills the tables and undo puts it back', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await importGuests(page);

  await page.getByTestId('auto-assign').click();
  await expect(seatedCount(page)).toContainText('4/4');

  await page.getByTestId('undo-seating').click();
  await expect(seatedCount(page)).toContainText('0/4');
});

test('locking assignments disables auto-assign', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await importGuests(page);

  await page.getByTestId('lock-assignments').check();
  await expect(page.getByTestId('auto-assign')).toBeDisabled();
});

test('numbering labels every seated table', async ({ page }) => {
  // Placing selects the new table, so the detail pane is already showing it.
  await page.getByTestId('catalog-round-60').click();
  await expect(page.getByTestId('apply-numbering')).toContainText(/Apply to \d+/);

  await page.getByTestId('apply-numbering').click();

  // The label reaches the plan, so the table detail can name it.
  await expect(page.getByTestId('table-detail')).toContainText(/T\d+/);
});

/** Middle of an element, in its own coordinate space. */
async function centre(locator: ReturnType<Page['getByTestId']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.width / 2, y: box.height / 2 };
}
