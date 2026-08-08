/**
 * Snapping — grid, angle, and alignment guides.
 *
 * Snapping is what makes a plan look drafted rather than sketched. It is also
 * the difference between a layout that measures correctly and one that is
 * almost right, so it belongs in the tested geometry layer rather than in the
 * pointer handlers.
 */

import type { Point } from './vec';
import type { Rect } from './transform';
import { normalizeAngle } from './transform';
import { inches } from './units';

/**
 * Six inches. Venue layouts are dimensioned in half-feet far more often than in
 * anything metric, and a 6" grid divides evenly into every standard table and
 * clearance in the catalog.
 */
export const DEFAULT_GRID_MM = inches(6);

/** Snap a scalar to the nearest multiple of `gridMm`. A grid of 0 disables it. */
export function snapValue(value: number, gridMm: number): number {
  if (gridMm <= 0) return value;
  const snapped = Math.round(value / gridMm) * gridMm;
  return snapped === 0 ? 0 : snapped;
}

export function snapPoint(point: Point, gridMm: number): Point {
  return { x: snapValue(point.x, gridMm), y: snapValue(point.y, gridMm) };
}

/** Snap an angle in degrees to the nearest `stepDegrees`, normalized to [0, 360). */
export function snapAngle(degrees: number, stepDegrees: number): number {
  if (stepDegrees <= 0) return degrees;
  return normalizeAngle(Math.round(degrees / stepDegrees) * stepDegrees);
}

export type GuideAxis = 'x' | 'y';
export type GuideKind = 'start' | 'center' | 'end';

export interface AlignmentGuide {
  /** 'x' is a vertical line at `position`; 'y' is a horizontal one. */
  readonly axis: GuideAxis;
  /** Millimetre coordinate of the guide line. */
  readonly position: number;
  /** Which edge of the moving rectangle matched. */
  readonly kind: GuideKind;
  /** How far the moving rectangle must shift to sit on the guide. */
  readonly deltaMm: number;
}

/**
 * Find alignment guides between a moving rectangle and its neighbours.
 *
 * Compares the three interesting positions on each axis — leading edge, centre,
 * trailing edge — against the same three on every candidate, and reports any
 * pair within `toleranceMm`.
 *
 * Results are sorted by how far the moving rectangle would have to shift, so a
 * caller wanting the single best snap can take `guides[0]` without sorting.
 */
export function alignmentGuides(
  moving: Rect,
  candidates: readonly Rect[],
  toleranceMm: number
): AlignmentGuide[] {
  const guides: AlignmentGuide[] = [];

  const axes: readonly { axis: GuideAxis; start: number; size: number }[] = [
    { axis: 'x', start: moving.x, size: moving.width },
    { axis: 'y', start: moving.y, size: moving.height },
  ];

  for (const { axis, start, size } of axes) {
    const movingPositions: readonly { kind: GuideKind; at: number }[] = [
      { kind: 'start', at: start },
      { kind: 'center', at: start + size / 2 },
      { kind: 'end', at: start + size },
    ];

    for (const other of candidates) {
      const otherStart = axis === 'x' ? other.x : other.y;
      const otherSize = axis === 'x' ? other.width : other.height;
      const otherPositions = [otherStart, otherStart + otherSize / 2, otherStart + otherSize];

      for (const mine of movingPositions) {
        for (const theirs of otherPositions) {
          const delta = theirs - mine.at;
          if (Math.abs(delta) > toleranceMm) continue;
          guides.push({
            axis,
            position: Math.round(theirs),
            kind: mine.kind,
            deltaMm: Math.round(delta),
          });
        }
      }
    }
  }

  return guides.sort((a, b) => Math.abs(a.deltaMm) - Math.abs(b.deltaMm));
}
