/**
 * Polygons — area, centroid, containment.
 *
 * Rooms are polygons: rectangular most of the time, L-shaped or irregular often
 * enough that assuming rectangles would be wrong. Area feeds the occupant-load
 * estimate, so it has to be right for concave shapes too.
 *
 * Coordinates are integer millimetres; polygons are implicitly closed (the last
 * vertex joins back to the first — do not repeat it).
 */

import type { Point } from './vec';
import { distance, round } from './vec';
import { MM_PER_FOOT } from './units';

/** Twice the signed area. Positive is clockwise in screen coordinates. */
function shoelace(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    sum += a.x * b.y - b.x * a.y;
  }
  return sum;
}

/** Unsigned area in square millimetres. Winding direction does not matter. */
export function area(points: readonly Point[]): number {
  if (points.length < 3) return 0;
  return Math.abs(shoelace(points)) / 2;
}

/**
 * Winding direction, in screen coordinates where +y points down.
 *
 * Used to normalize user-drawn rooms so downstream offsetting (wall thickness,
 * clearance bands) always pushes the same way.
 */
export function isClockwise(points: readonly Point[]): boolean {
  return shoelace(points) > 0;
}

/** Total edge length in millimetres, including the closing edge. */
export function perimeter(points: readonly Point[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    total += distance(a, b);
  }
  return total;
}

/**
 * Area centroid, rounded to integer millimetres.
 *
 * This is the true centroid, not the average of the vertices — the two differ
 * for any polygon with unevenly spaced corners, and the centroid is what a
 * rotation handle should pivot around.
 */
export function centroid(points: readonly Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length < 3) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return round({ x: sum.x / points.length, y: sum.y / points.length });
  }

  const twiceArea = shoelace(points);
  if (twiceArea === 0) {
    // Collinear vertices: fall back to the vertex average rather than dividing
    // by zero and returning NaN coordinates.
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return round({ x: sum.x / points.length, y: sum.y / points.length });
  }

  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    const cross = a.x * b.y - b.x * a.y;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
  }

  return round({ x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) });
}

/**
 * Is `point` inside `polygon`?
 *
 * Ray casting, with points exactly on an edge counted as **inside**. A table
 * pushed flush against a wall is in the room, and a user who snapped it there
 * deliberately should not see it drop out of the seat count.
 */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  if (polygon.length < 3) return false;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a === undefined || b === undefined) continue;
    if (isOnSegment(point, a, b)) return true;
  }

  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;

    const straddles = a.y > point.y !== b.y > point.y;
    if (!straddles) continue;

    const crossingX = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < crossingX) inside = !inside;
  }

  return inside;
}

function isOnSegment(point: Point, a: Point, b: Point): boolean {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  if (cross !== 0) return false;
  return (
    Math.min(a.x, b.x) <= point.x &&
    point.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= point.y &&
    point.y <= Math.max(a.y, b.y)
  );
}

const SQ_MM_PER_SQ_FOOT = MM_PER_FOOT * MM_PER_FOOT;

/**
 * Square millimetres to square feet.
 *
 * Occupant-load factors (NFPA 101) are published per square foot, so the
 * capacity layer needs this even in a metric-first document model.
 */
export function squareMmToSquareFeet(squareMm: number): number {
  return squareMm / SQ_MM_PER_SQ_FOOT;
}
