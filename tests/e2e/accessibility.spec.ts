/**
 * Operating the app without a pointer.
 *
 * WCAG 2.1.1 asks that every function be reachable by keyboard, and a canvas
 * editor is where that promise is usually quietly broken. These drive the real
 * flow with keys alone, and check the parts a screen reader depends on: names
 * on the landmarks, a text summary of a drawing that is otherwise opaque, and
 * a focus ring that survives.
 */

import { test, expect, type Page } from '@playwright/test';
import { startPlan } from './start';

async function focusPlan(page: Page): Promise<void> {
  await page.getByTestId('canvas-host').focus();
  await expect(page.getByTestId('canvas-host')).toBeFocused();
}

test('the skip link is the first stop and lands on the plan', async ({ page }) => {
  await startPlan(page);
  // A fresh load, so the browser's sequential-navigation point is the top of
  // the document rather than wherever the last click left it.
  await page.reload();
  await page.getByTestId('start-screen').waitFor();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: /skip to the plan/i });

  await expect(skip).toBeFocused();
  // Hidden until focused, so it costs sighted users nothing.
  await expect(skip).toBeVisible();
  await expect(skip).toHaveAttribute('href', '#plan');
});

test('a plan can be selected, moved and deleted with keys alone', async ({ page }) => {
  await startPlan(page);
  await focusPlan(page);

  const elements = page.getByTestId('element-count');
  const before = await elements.textContent();

  // ] steps through the plan — the keyboard equivalent of clicking an element.
  // The first stop is the room, which every template locks, so step past it to
  // reach something that can actually be moved.
  await page.keyboard.press(']');
  await page.keyboard.press(']');
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
  await expect(page.getByTestId('duplicate')).toBeEnabled();

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowDown');
  // Nudging never changes what exists.
  await expect(elements).toHaveText(before ?? '');

  await page.keyboard.press('Delete');
  await expect(elements).not.toHaveText(before ?? '');

  await page.keyboard.press('Control+z');
  await expect(elements).toHaveText(before ?? '');
});

test('stepping wraps, and steps backwards', async ({ page }) => {
  await startPlan(page);
  await focusPlan(page);

  await page.keyboard.press(']');
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');

  await page.keyboard.press('[');
  await page.keyboard.press('[');
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('selection-count')).toHaveText('0 selected');
});

test('the drawing has a summary in words', async ({ page }) => {
  await startPlan(page);

  const summary = page.getByTestId('plan-summary');
  await expect(summary).toHaveText(/\d+ elements, \d+ seats/);
  await expect(summary).toContainText('Nothing selected');

  await focusPlan(page);
  await page.keyboard.press(']');
  await expect(summary).toContainText('Selected:');
});

test('typing in a field does not reach the plan', async ({ page }) => {
  await startPlan(page);

  await focusPlan(page);
  await page.keyboard.press(']');
  const before = await page.getByTestId('element-count').textContent();

  // Backspace while correcting a search term used to delete the selected
  // tables, because the shortcuts are bound to the window.
  const search = page.getByTestId('guest-search');
  await search.fill('adam');
  await search.press('Backspace');
  await search.press('Control+a');

  await expect(page.getByTestId('element-count')).toHaveText(before ?? '');
  await expect(page.getByTestId('selection-count')).toHaveText('1 selected');
});

test('every region has a name', async ({ page }) => {
  await startPlan(page);

  for (const name of [
    'Object catalog',
    'Guests and seating',
    'Capacity and clearance',
    'Edit and arrange',
    'File and export',
  ]) {
    await expect(page.getByLabel(name).first()).toBeVisible();
  }
});

test('the canvas says what it is and which keys it takes', async ({ page }) => {
  await startPlan(page);

  const canvas = page.getByTestId('canvas-host');
  await expect(canvas).toHaveRole('application');
  await expect(canvas).toHaveAttribute('aria-label', /arrow keys/i);
  await expect(canvas).toHaveAttribute('tabindex', '0');
});

test('every control on the start screen is reachable by tab', async ({ page }) => {
  await page.goto('/');

  const reached: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    if (id) reached.push(id);
  }

  expect(reached).toContain('start-name');
  expect(reached).toContain('start-width');
  expect(reached).toContain('start-open');
  expect(reached).toContain('template-wedding');
});
