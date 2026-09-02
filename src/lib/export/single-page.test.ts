/**
 * Fit-to-one-page export.
 *
 * The deliberate exception to the ruler test: this mode gives up measurability
 * to guarantee one sheet. Both halves of that trade are pinned here — it must
 * actually produce one page, and it must actually say it cannot be measured.
 */

import { describe, it, expect } from 'vitest';
import { exportPlanPdf } from './plan-pdf';
import { exportPlanSvg } from './plan-svg';
import {
  fitScale,
  fitsOnPage,
  isStandardScale,
  drawableArea,
  largestFittingScale,
  mmToPdfPoints,
  POINTS_PER_MM,
  PAGE,
  SCALE,
} from './projection';
import { createDocument, addElement } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';

/** The title block strip, which `plan-pdf` reserves off the drawable height. */
const TITLE_BLOCK_HEIGHT_PT = 54;

/** The Pavilion plan that motivated this: 35.26 m × 14.96 m. */
const PAVILION_W = 35260;
const PAVILION_H = 14963;

function planOf(widthMm: number, heightMm: number) {
  const room: FloorElement = {
    id: 'room',
    type: 'room',
    layer: 'room',
    rotationDeg: 0,
    locked: true,
    label: 'Pavilion',
    points: [
      { x: 0, y: 0 },
      { x: widthMm, y: 0 },
      { x: widthMm, y: heightMm },
      { x: 0, y: heightMm },
    ],
  };
  return addElement(createDocument(), room);
}

describe('the drawable area', () => {
  it('subtracts the title block, which the old fit test did not', () => {
    const page = PAGE.letterLandscape;
    const withBlock = drawableArea(page, TITLE_BLOCK_HEIGHT_PT);

    expect(withBlock.widthPt).toBe(page.widthPt - page.marginPt * 2);
    expect(withBlock.heightPt).toBe(page.heightPt - page.marginPt * 2 - TITLE_BLOCK_HEIGHT_PT);
  });

  it('never reports a fit the tiler would then split', () => {
    // A plan sized to land in the gap the old test ignored: it clears the
    // margins but not the title block.
    const page = PAGE.letterLandscape;
    const gapPt = page.heightPt - page.marginPt * 2 - 10;
    const heightMm = gapPt / (SCALE.imperial1_8 * POINTS_PER_MM);

    expect(fitsOnPage(1000, heightMm, SCALE.imperial1_8, page)).toBe(true);
    expect(fitsOnPage(1000, heightMm, SCALE.imperial1_8, page, TITLE_BLOCK_HEIGHT_PT)).toBe(false);
  });
});

describe('fitScale', () => {
  it('produces a scale that exactly fits the drawable area', () => {
    const page = PAGE.letterLandscape;
    const scale = fitScale(PAVILION_W, PAVILION_H, page, TITLE_BLOCK_HEIGHT_PT);
    const drawable = drawableArea(page, TITLE_BLOCK_HEIGHT_PT);

    expect(mmToPdfPoints(PAVILION_W, scale)).toBeLessThanOrEqual(drawable.widthPt + 1e-9);
    expect(mmToPdfPoints(PAVILION_H, scale)).toBeLessThanOrEqual(drawable.heightPt + 1e-9);

    // Exactly fits means one axis is flush against its limit, not merely inside.
    const flushWidth = Math.abs(mmToPdfPoints(PAVILION_W, scale) - drawable.widthPt) < 1e-9;
    const flushHeight = Math.abs(mmToPdfPoints(PAVILION_H, scale) - drawable.heightPt) < 1e-9;
    expect(flushWidth || flushHeight).toBe(true);
  });

  it('is not a scale any rule reads, for this plan', () => {
    const scale = fitScale(PAVILION_W, PAVILION_H, PAGE.letterLandscape, TITLE_BLOCK_HEIGHT_PT);
    expect(isStandardScale(scale)).toBe(false);
  });

  it('returns full size for a plan with no extent, rather than dividing by zero', () => {
    expect(fitScale(0, 0, PAGE.letterLandscape)).toBe(SCALE.full);
  });
});

describe('exporting the Pavilion plan', () => {
  const doc = planOf(PAVILION_W, PAVILION_H);

  it('tiles by default, because no standard scale fits it', () => {
    expect(
      largestFittingScale(PAVILION_W, PAVILION_H, PAGE.letterLandscape, 'imperial')
    ).toBeNull();

    const result = exportPlanPdf(doc);
    expect(result.pages).toBeGreaterThan(1);
    expect(result.tiled).toBe(true);
  });

  it('produces exactly one sheet with singlePage', () => {
    const result = exportPlanPdf(doc, { singlePage: true });
    expect(result.pages).toBe(1);
    expect(result.tiled).toBe(false);
  });

  it('reports the sheet as not to scale', () => {
    const result = exportPlanPdf(doc, { singlePage: true });
    expect(result.notToScale).toBe(true);
    expect(result.pdf).toContain('NOT TO SCALE');
  });

  it('leaves a standard-scale export unstamped', () => {
    const result = exportPlanPdf(doc, { scale: SCALE.imperial1_8 });
    expect(result.notToScale).toBe(false);
    expect(result.pdf).not.toContain('NOT TO SCALE');
  });

  it('lets an explicit scale win over singlePage', () => {
    // An explicit scale is a stronger instruction than a page-count preference,
    // so asking for 1/8" and one page gives 1/8" and however many sheets.
    const result = exportPlanPdf(doc, { singlePage: true, scale: SCALE.imperial1_8 });
    expect(result.scale).toBe(SCALE.imperial1_8);
    expect(result.pages).toBeGreaterThan(1);
  });

  it('exports SVG at the same fitted scale', () => {
    const svg = exportPlanSvg(doc, { singlePage: true, marginMm: 0 });
    const expected = fitScale(PAVILION_W, PAVILION_H, PAGE.letterLandscape);

    // The SVG states its scale in its description, which is where a reader who
    // opens the file rather than the app finds out what they are holding.
    expect(svg).toContain(`1:${String(Math.round(1 / expected))}`);
  });
});

describe('a plan that already fits', () => {
  // 21ft × 12ft. Deliberately not a round fraction of the sheet, so the fitted
  // scale is a ratio no rule reads.
  const doc = planOf(6401, 3658);

  it('still gets one sheet, at a standard scale, by default', () => {
    const result = exportPlanPdf(doc);
    expect(result.pages).toBe(1);
    expect(isStandardScale(result.scale)).toBe(true);
    expect(result.notToScale).toBe(false);
  });

  it('is drawn larger by singlePage, and loses measurability for it', () => {
    const standard = exportPlanPdf(doc);
    const fitted = exportPlanPdf(doc, { singlePage: true });

    expect(fitted.pages).toBe(1);
    expect(fitted.scale).toBeGreaterThan(standard.scale);
    expect(fitted.notToScale).toBe(true);
  });

  it('is not stamped when the fit happens to land on a standard scale', () => {
    // 20ft wide fills the 720pt drawable at exactly 1/2" = 1'-0". Nothing is
    // lost in that case, so the warning would be a lie.
    const exact = exportPlanPdf(planOf(6096, 3658), { singlePage: true });
    expect(exact.scale).toBe(SCALE.imperial1_2);
    expect(exact.notToScale).toBe(false);
    expect(exact.pdf).not.toContain('NOT TO SCALE');
  });
});
