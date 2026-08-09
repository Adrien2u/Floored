/**
 * Export and file round-trip.
 *
 * The export maths is unit-tested against the emitted bytes; this covers what
 * those tests cannot — that the browser actually hands the user a file, and
 * that a saved plan reopens as the same plan.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas-host')).toBeVisible();
});

test('shows what the export will produce before you click', async ({ page }) => {
  // The sample ballroom fits one sheet at 1/8" = 1'-0".
  await expect(page.getByTestId('export-preview')).toContainText('1 sheet');
  await expect(page.getByTestId('export-preview')).toContainText(`1/8"`);
});

test('the preview follows the chosen scale', async ({ page }) => {
  await page.getByTestId('scale-select').selectOption({ label: '1/2" = 1\'-0"' });

  // A 60ft room at 1/2" = 1'-0" is far larger than a letter sheet.
  await expect(page.getByTestId('export-preview')).toContainText('sheets');
  await expect(page.getByTestId('export-preview')).toContainText(`1/2"`);
});

test('exports a PDF the browser saves', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.pdf$/);

  const path = await download.path();
  const bytes = readFileSync(path);
  // A real PDF, not an empty file.
  expect(bytes.subarray(0, 8).toString()).toBe('%PDF-1.7');
  expect(bytes.length).toBeGreaterThan(1000);
});

test('the exported PDF carries the title block', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-pdf').click();
  const download = await downloadPromise;

  const text = readFileSync(await download.path(), 'latin1');
  expect(text).toContain('Spring Gala');
  // Without the scale, a to-scale drawing cannot be measured.
  expect(text).toContain('SCALE');
});

test('exports an SVG', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-svg').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.svg$/);

  const text = readFileSync(await download.path(), 'utf8');
  expect(text).toContain('<svg');
  // A physical size is what makes printing at 100% measurable.
  expect(text).toMatch(/width="[\d.]+mm"/);
});

test('exports a PNG from the canvas', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-png').click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = readFileSync(await download.path());
  // PNG magic number.
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
});

test('says a PNG is screen quality, so nobody measures one', async ({ page }) => {
  await page.getByTestId('export-png').click();
  await expect(page.getByTestId('file-message')).toContainText('PDF for anything measured');
});

test('saves and reopens a plan unchanged', async ({ page }) => {
  const beforeElements = await page.getByTestId('element-count').textContent();
  const beforeSeats = await page.getByTestId('seat-count').textContent();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  const download = await downloadPromise;
  const path = await download.path();

  // Change the plan, so reopening has something to undo.
  await page.getByTestId('catalog-round-72').click();
  expect(await page.getByTestId('element-count').textContent()).not.toBe(beforeElements);

  await page.getByTestId('open').click();
  await page.locator('input[type="file"]').setInputFiles(path);

  await expect(page.getByTestId('element-count')).toHaveText(beforeElements ?? '');
  await expect(page.getByTestId('seat-count')).toHaveText(beforeSeats ?? '');
});

test('opening clears the undo history, which belonged to the old plan', async ({ page }) => {
  await page.getByTestId('catalog-round-60').click();
  await expect(page.getByTestId('undo')).toBeEnabled();

  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save').click();
  const path = await (await downloadPromise).path();

  await page.getByTestId('open').click();
  await page.locator('input[type="file"]').setInputFiles(path);

  // Ctrl+Z reaching back into a different document would be alarming.
  await expect(page.getByTestId('undo')).toBeDisabled();
});

test('refuses a malformed file with a readable message', async ({ page }, testInfo) => {
  const bad = testInfo.outputPath('broken.floored');
  const fs = await import('node:fs/promises');
  await fs.writeFile(bad, 'this is not a floor plan');

  await page.getByTestId('open').click();
  await page.locator('input[type="file"]').setInputFiles(bad);

  const message = page.getByTestId('file-message');
  await expect(message).toBeVisible();
  await expect(message).toContainText('not valid JSON');
  // The plan on screen must survive a failed open.
  await expect(page.getByTestId('element-count')).not.toHaveText('0 elements');
});

test('opening a version 1 file upgrades it and says so', async ({ page }) => {
  await page.getByTestId('open').click();
  await page.locator('input[type="file"]').setInputFiles('tests/fixtures/v1-sample.floored');

  await expect(page.getByTestId('file-message')).toContainText('upgraded from format 1');
  await expect(page.getByTestId('seat-count')).toHaveText('16');
});
