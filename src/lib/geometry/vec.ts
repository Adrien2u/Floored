/**
 * Points and vectors.
 *
 * Every coordinate in this module is an integer millimetre. `Point` deliberately
 * uses bare `x` / `y` rather than the project's `Mm` suffix: inside the geometry
 * layer millimetres are the only unit that exists, and `a.xMm - b.xMm` reads
 * worse than the arithmetic it describes. The suffix rule applies to scalar
 * lengths that cross module boundaries.
 *
 * The coordinate system is screen-oriented: +x is right, +y is **down**.
 *
 * See ADR-0006.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Round a fractional point back onto the integer-millimetre lattice.
 *
 * Negative zero is normalized to zero. `Math.round(-0.0001)` yields `-0`, which
 * `JSON.stringify` writes as `0` — so without this, a document saved and
 * reloaded would not deep-equal the one in memory, and round-trip tests would
 * fail for a reason that has nothing to do with geometry.
 */
export function round(p: { x: number; y: number }): Point {
  // Math.round(-10.6) is -11 and Math.round(-10.5) is -10; the asymmetry at
  // exact halves is irrelevant at millimetre scale and is not worth a branch.
  return { x: zeroed(Math.round(p.x)), y: zeroed(Math.round(p.y)) };
}

function zeroed(n: number): number {
  return n === 0 ? 0 : n;
}

export function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(p: Point, factor: number): Point {
  return round({ x: p.x * factor, y: p.y * factor });
}

/** Straight-line distance in millimetres. Not rounded — callers decide. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Distance from the origin. */
export function length(p: Point): number {
  return Math.hypot(p.x, p.y);
}

export function midpoint(a: Point, b: Point): Point {
  return round({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
}

/**
 * Unit vector pointing from `from` to `to`.
 *
 * Returns `{x: 0, y: 0}` for coincident points instead of NaN — a degenerate
 * direction should make callers do nothing, not poison every downstream sum.
 */
export function direction(from: Point, to: Point): { x: number; y: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Exact equality is safe here precisely because coordinates are integers. */
export function equals(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}
