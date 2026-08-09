/**
 * Colour contrast.
 *
 * WCAG 2.2 asks for 4.5:1 on body text and 3:1 on large text and on the visual
 * boundaries of controls. Those are numbers, so they can be checked rather than
 * eyeballed — and a palette drifts one commit at a time, which is exactly the
 * kind of regression a test catches and a person does not.
 *
 * The tokens are read out of `app.css` rather than duplicated here. A copy
 * would pass forever while the real palette went wrong.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(fileURLToPath(new URL('../app.css', import.meta.url)), 'utf8');

/** WCAG minimum for body text. */
const AA_TEXT = 4.5;
/** WCAG minimum for large text, icons, and control boundaries. */
const AA_LARGE = 3;

function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(/--(color-[\w-]+):\s*(#[0-9a-f]{6})/gi)) {
    if (name && value) found[name] = value;
  }
  return found;
}

/** The light palette is the bare `:root` block, before any media query. */
const light = tokens(CSS.slice(0, CSS.indexOf('@media')));

/** The dark palette overrides only some tokens, so it inherits the rest. */
const dark = { ...light, ...tokens(CSS.slice(CSS.indexOf('prefers-color-scheme: dark'))) };

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Hue angle in degrees, for judging whether two colours read as different. */
function hue(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const span = max - min;
  if (span === 0) return 0;

  const degrees =
    max === r ? ((g - b) / span) % 6 : max === g ? (b - r) / span + 2 : (r - g) / span + 4;

  return (degrees * 60 + 360) % 360;
}

/** Shortest angle between two hues, so 350° and 10° are 20° apart. */
function hueDistance(a: string, b: string): number {
  const difference = Math.abs(hue(a) - hue(b)) % 360;
  return difference > 180 ? 360 - difference : difference;
}

function ratio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
}

describe('the contrast maths', () => {
  it('agrees with the known extremes', () => {
    expect(ratio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(ratio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe.each([
  ['light', light],
  ['dark', dark],
])('%s palette', (_name, palette) => {
  const surface = palette['color-surface'] ?? '';
  const panel = palette['color-panel'] ?? '';

  it('has every token the app uses', () => {
    for (const token of [
      'color-surface',
      'color-panel',
      'color-text',
      'color-muted',
      'color-line',
      'color-accent',
      'color-warn',
    ]) {
      expect(palette[token]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('reads body text at 4.5:1 or better, on both surfaces', () => {
    const text = palette['color-text'] ?? '';
    expect(ratio(text, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(text, panel)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('reads secondary text at 4.5:1 — muted is not an excuse for grey on grey', () => {
    const muted = palette['color-muted'] ?? '';
    expect(ratio(muted, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(muted, panel)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('reads the accent at 4.5:1, since it is used for links and labels', () => {
    const accent = palette['color-accent'] ?? '';
    expect(ratio(accent, surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('reads warnings at 4.5:1 — the one message nobody can afford to miss', () => {
    const warn = palette['color-warn'] ?? '';
    expect(ratio(warn, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(ratio(warn, palette['color-warn-soft'] ?? surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('draws the focus ring at 3:1, or it cannot be found', () => {
    const accent = palette['color-accent'] ?? '';
    expect(ratio(accent, surface)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(ratio(accent, panel)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('keeps the accent a different hue from the warning colour', () => {
    // Both appear on a plan at once — a selected table beside a clearance
    // warning — and telling them apart is the whole point of using two hues.
    //
    // Measured as hue angle, not as contrast ratio: two colours of identical
    // lightness can be perfectly distinguishable, and an earlier version of
    // this test failed a palette that was fine because it asked the wrong
    // question. Blue against amber also survives the common colour-vision
    // deficiencies, which a red/green pair would not.
    const apart = hueDistance(palette['color-accent'] ?? '', palette['color-warn'] ?? '');
    expect(apart).toBeGreaterThan(60);
  });
});
