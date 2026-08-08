/**
 * Rotation, rectangles, and bounding boxes.
 *
 * Angles are **degrees, clockwise on screen** — the coordinate system has +y
 * pointing down, so a positive rotation turns the way a user expects when they
 * drag a rotation handle to the right.
 *
 * Every returned coordinate is an integer millimetre (ADR-0006).
 */

import type { Point } from './vec';
import { round } from './vec';

/** An axis-aligned rectangle. `x`,`y` is the top-left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Fold any angle into [0, 360). */
export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/**
 * Rotate `point` about `origin` by `degrees`, clockwise on screen.
 *
 * The result is rounded to the nearest millimetre. Callers animating a drag
 * should rotate the *original* point by the total angle each frame rather than
 * rotating the previous result — repeated rounding walks the object.
 */
export function rotatePoint(point: Point, origin: Point, degrees: number): Point {
  const angle = normalizeAngle(degrees);
  if (angle === 0) return point;

  const rad = degToRad(angle);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;

  return round({
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  });
}

/** Corners clockwise from the top-left. */
export function rectCorners(rect: Rect): [Point, Point, Point, Point] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

export function rectCenter(rect: Rect): Point {
  return round({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
}

/** Smallest axis-aligned rectangle containing every point. */
export function boundsOf(points: readonly Point[]): Rect {
  const first = points[0];
  if (first === undefined) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x;
  let maxY = first.y;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Axis-aligned bounds of a rectangle rotated about its own centre.
 *
 * Used for hit-testing and for the spatial index, both of which work in
 * axis-aligned boxes even when the element itself is turned.
 */
export function boundsOfRotatedRect(rect: Rect, degrees: number): Rect {
  if (normalizeAngle(degrees) === 0) return rect;
  const origin = rectCenter(rect);
  return boundsOf(rectCorners(rect).map((corner) => rotatePoint(corner, origin, degrees)));
}

/**
 * Do two rectangles overlap?
 *
 * Shared edges do **not** count as overlapping — two tables pushed exactly
 * together are touching, not colliding, and flagging that would make the
 * clearance warnings cry wolf.
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
