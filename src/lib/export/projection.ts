/**
 * Millimetre-to-PDF-point projection.
 *
 * This is one of the two coordinate projections the architecture permits
 * (ADR-0006); the other is `mmToScreen`. SVG and PNG export chain off one of
 * these rather than introducing a third.
 *
 * Two conversions happen here, and they are separate concerns:
 *
 *  1. **Unit**: PDF user space is 1/72 inch. `mm × 72 / 25.4` is exact.
 *  2. **Origin**: PDF puts (0,0) at the bottom-left with +y **up**. The document
 *     model puts it at the top-left with +y **down**. Everything must be flipped
 *     against the page height, and forgetting this produces a plan that is
 *     correct in every dimension and upside down.
 *
 * See ADR-0007.
 */

import type { Point } from '$lib/geometry/vec';
import { MM_PER_INCH } from '$lib/geometry/units';

/** PDF user-space units per inch. Fixed by the PDF specification. */
export const POINTS_PER_INCH = 72;

/** Exact conversion factor from millimetres to PDF points. */
export const POINTS_PER_MM = POINTS_PER_INCH / MM_PER_INCH;

/**
 * A drawing scale, expressed as the ratio of paper length to real length.
 *
 * `1/96` means one unit on paper represents 96 in the world — which is the
 * imperial architect's scale 1/8" = 1'-0", since an eighth of an inch stands in
 * for twelve inches.
 */
export type DrawingScale = number;

/** The scales an event plan is actually drawn at. */
export const SCALE = {
  /** 1/8" = 1'-0". Fits a large ballroom on one sheet. */
  imperial1_8: 1 / 96,
  /** 1/4" = 1'-0". The common detail scale. */
  imperial1_4: 1 / 48,
  /** 1/2" = 1'-0". Close-up details. */
  imperial1_2: 1 / 24,
  /** 1:100 metric. */
  metric1_100: 1 / 100,
  /** 1:50 metric. */
  metric1_50: 1 / 50,
  /** Full size. Only useful for tests. */
  full: 1,
} as const;

/** Human-readable label for a title block. */
export function scaleLabel(scale: DrawingScale): string {
  switch (scale) {
    case SCALE.imperial1_8:
      return '1/8" = 1\'-0"';
    case SCALE.imperial1_4:
      return '1/4" = 1\'-0"';
    case SCALE.imperial1_2:
      return '1/2" = 1\'-0"';
    case SCALE.metric1_100:
      return '1:100';
    case SCALE.metric1_50:
      return '1:50';
    case SCALE.full:
      return '1:1';
    default:
      return `1:${Math.round(1 / scale).toString()}`;
  }
}

/**
 * Project a real-world length in millimetres to a length on the page, in points.
 *
 * This is the function the ruler test pins. If it is wrong, every printed plan
 * is wrong, and the product's central claim is false.
 */
export function mmToPdfPoints(lengthMm: number, scale: DrawingScale): number {
  return lengthMm * scale * POINTS_PER_MM;
}

/** Inverse of {@link mmToPdfPoints}, for reading measurements back off a page. */
export function pdfPointsToMm(points: number, scale: DrawingScale): number {
  return points / (scale * POINTS_PER_MM);
}

/** A page, described in PDF points. */
export interface PageSpec {
  readonly widthPt: number;
  readonly heightPt: number;
  /** Uniform margin, in points. */
  readonly marginPt: number;
}

/** Page sizes in PDF points, from the PDF specification. */
export const PAGE = {
  letter: { widthPt: 612, heightPt: 792, marginPt: 36 },
  letterLandscape: { widthPt: 792, heightPt: 612, marginPt: 36 },
  a4: { widthPt: 595.28, heightPt: 841.89, marginPt: 36 },
  a4Landscape: { widthPt: 841.89, heightPt: 595.28, marginPt: 36 },
} as const satisfies Record<string, PageSpec>;

/**
 * Project a document point into PDF page coordinates.
 *
 * Applies the scale, offsets by the page margin, and flips the y axis so the
 * plan appears the right way up. `origin` is the document coordinate that should
 * land at the top-left of the drawable area.
 */
export function projectPoint(
  point: Point,
  scale: DrawingScale,
  page: PageSpec,
  origin: Point = { x: 0, y: 0 }
): { x: number; y: number } {
  const xPt = page.marginPt + mmToPdfPoints(point.x - origin.x, scale);
  const yFromTopPt = page.marginPt + mmToPdfPoints(point.y - origin.y, scale);
  return { x: xPt, y: page.heightPt - yFromTopPt };
}

/**
 * Does a plan of this size fit on one page at this scale?
 *
 * Used to decide whether to tile across sheets before committing to a layout.
 */
export function fitsOnPage(
  widthMm: number,
  heightMm: number,
  scale: DrawingScale,
  page: PageSpec
): boolean {
  const drawableWidth = page.widthPt - page.marginPt * 2;
  const drawableHeight = page.heightPt - page.marginPt * 2;
  return (
    mmToPdfPoints(widthMm, scale) <= drawableWidth &&
    mmToPdfPoints(heightMm, scale) <= drawableHeight
  );
}

/** Scales drawn on an imperial architect's rule. */
const IMPERIAL_SCALES = [SCALE.imperial1_2, SCALE.imperial1_4, SCALE.imperial1_8];

/** Scales drawn on a metric scale rule. */
const METRIC_SCALES = [SCALE.metric1_50, SCALE.metric1_100];

/**
 * Largest standard scale at which the plan fits on one page.
 *
 * Restricted to the scales of one measuring system, because that is the whole
 * point: a plan drawn at 1/8" = 1'-0" can only be measured with an imperial
 * architect's rule, and handing that to someone working in metric breaks the
 * promise just as thoroughly as getting the arithmetic wrong.
 *
 * Returns `null` when even the smallest standard scale overflows — the caller
 * must then tile across sheets. Never invents an intermediate scale, since no
 * physical rule would read it.
 */
export function largestFittingScale(
  widthMm: number,
  heightMm: number,
  page: PageSpec,
  system: 'imperial' | 'metric' = 'imperial'
): DrawingScale | null {
  // Sorted here rather than maintained by hand: 1/48 is larger than 1/50 and
  // 1/96 is larger than 1/100, which is easy to get backwards when the list is
  // written out in a plausible-looking order.
  const candidates = [...(system === 'imperial' ? IMPERIAL_SCALES : METRIC_SCALES)].sort(
    (a, b) => b - a
  );

  for (const scale of candidates) {
    if (fitsOnPage(widthMm, heightMm, scale, page)) return scale;
  }
  return null;
}
