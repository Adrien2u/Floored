import { describe, it, expect } from 'vitest';
import {
  degToRad,
  radToDeg,
  normalizeAngle,
  rotatePoint,
  rectCorners,
  rectCenter,
  boundsOf,
  boundsOfRotatedRect,
  rectsOverlap,
} from './transform';
import { inches } from './units';

const p = (x: number, y: number) => ({ x, y });

describe('angle helpers', () => {
  it('converts between degrees and radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    expect(radToDeg(Math.PI)).toBeCloseTo(180, 12);
  });

  it('normalizes to the half-open range [0, 360)', () => {
    expect(normalizeAngle(0)).toBe(0);
    expect(normalizeAngle(360)).toBe(0);
    expect(normalizeAngle(370)).toBe(10);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(-450)).toBe(270);
  });
});

describe('rotatePoint', () => {
  it('rotates clockwise on screen, where +y points down', () => {
    expect(rotatePoint(p(1000, 0), p(0, 0), 90)).toEqual(p(0, 1000));
    expect(rotatePoint(p(1000, 0), p(0, 0), 180)).toEqual(p(-1000, 0));
    expect(rotatePoint(p(1000, 0), p(0, 0), 270)).toEqual(p(0, -1000));
  });

  it('is a no-op at zero and full turns', () => {
    expect(rotatePoint(p(123, 456), p(0, 0), 0)).toEqual(p(123, 456));
    expect(rotatePoint(p(123, 456), p(0, 0), 360)).toEqual(p(123, 456));
  });

  it('rotates about an arbitrary origin', () => {
    expect(rotatePoint(p(2000, 1000), p(1000, 1000), 90)).toEqual(p(1000, 2000));
  });

  it('returns integer millimetres', () => {
    const r = rotatePoint(p(1000, 0), p(0, 0), 37);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(Number.isInteger(r.y)).toBe(true);
  });

  // These two tests exist together on purpose: they are the executable form of
  // the warning in ADR-0006, and the reason rotatePoint's docblock says what it
  // says. Deleting either one removes the evidence for an API rule.

  it('accumulates real drift when applied incrementally', () => {
    let current = p(1000, 0);
    for (let i = 0; i < 360; i++) current = rotatePoint(current, p(0, 0), 1);

    const drift = Math.hypot(current.x - 1000, current.y);
    // Measured at ~27 mm. Rounding to the millimetre lattice on every step
    // cannot be lossless, so this is inherent, not a bug to fix. It is why a
    // drag must rotate the ORIGINAL point by the total angle each frame.
    expect(drift).toBeGreaterThan(5);
    expect(drift).toBeLessThan(50);
  });

  it('is exact when applied once with the total angle', () => {
    // The same full turn, done correctly.
    expect(rotatePoint(p(1000, 0), p(0, 0), 360)).toEqual(p(1000, 0));

    // And the same arc in one step lands where it should.
    let stepped = p(1000, 0);
    for (let i = 0; i < 90; i++) stepped = rotatePoint(stepped, p(0, 0), 1);
    const direct = rotatePoint(p(1000, 0), p(0, 0), 90);

    expect(direct).toEqual(p(0, 1000));
    expect(Math.hypot(stepped.x - direct.x, stepped.y - direct.y)).toBeGreaterThan(0);
  });
});

describe('rectangles', () => {
  const rect = { x: 100, y: 200, width: 1000, height: 500 };

  it('lists corners clockwise from top-left', () => {
    expect(rectCorners(rect)).toEqual([p(100, 200), p(1100, 200), p(1100, 700), p(100, 700)]);
  });

  it('finds the centre', () => {
    expect(rectCenter(rect)).toEqual(p(600, 450));
  });

  it('bounds a set of points', () => {
    expect(boundsOf([p(10, 50), p(-5, 200), p(300, 0)])).toEqual({
      x: -5,
      y: 0,
      width: 305,
      height: 200,
    });
  });

  it('returns a zero rect for no points rather than Infinity', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('grows the bounding box when a rect is rotated off-axis', () => {
    const square = { x: 0, y: 0, width: 1000, height: 1000 };
    expect(boundsOfRotatedRect(square, 0)).toEqual(square);

    const turned = boundsOfRotatedRect(square, 45);
    // A 1000 mm square rotated 45 degrees spans 1000 * sqrt(2).
    expect(turned.width).toBe(1414);
    expect(turned.height).toBe(1414);
  });

  it('is unchanged by quarter turns of a square', () => {
    const square = { x: 0, y: 0, width: 1000, height: 1000 };
    expect(boundsOfRotatedRect(square, 90)).toEqual(square);
  });

  it('detects overlap, treating shared edges as not overlapping', () => {
    const a = { x: 0, y: 0, width: 1000, height: 1000 };
    expect(rectsOverlap(a, { x: 500, y: 500, width: 1000, height: 1000 })).toBe(true);
    expect(rectsOverlap(a, { x: 1000, y: 0, width: 1000, height: 1000 })).toBe(false);
    expect(rectsOverlap(a, { x: 2000, y: 0, width: 1000, height: 1000 })).toBe(false);
  });
});

describe('real-world sanity', () => {
  it('keeps an 8ft banquet table 8ft long after a quarter turn', () => {
    const table = { x: 0, y: 0, width: inches(96), height: inches(30) };
    const turned = boundsOfRotatedRect(table, 90);
    expect(turned.width).toBe(inches(30));
    expect(turned.height).toBe(inches(96));
  });
});
