import { describe, it, expect } from 'vitest';
import {
  area,
  centroid,
  pointInPolygon,
  perimeter,
  isClockwise,
  squareMmToSquareFeet,
} from './polygon';
import { inches, feet } from './units';

const p = (x: number, y: number) => ({ x, y });

const square = [p(0, 0), p(1000, 0), p(1000, 1000), p(0, 1000)];

describe('area', () => {
  it('measures a square', () => {
    expect(area(square)).toBe(1_000_000);
  });

  it('is unsigned regardless of winding direction', () => {
    expect(area([...square].reverse())).toBe(1_000_000);
  });

  it('measures an L-shaped room', () => {
    // 2000x2000 with a 1000x1000 bite taken out of the bottom-right.
    const ell = [p(0, 0), p(2000, 0), p(2000, 1000), p(1000, 1000), p(1000, 2000), p(0, 2000)];
    expect(area(ell)).toBe(3_000_000);
  });

  it('returns zero for degenerate input', () => {
    expect(area([])).toBe(0);
    expect(area([p(0, 0)])).toBe(0);
    expect(area([p(0, 0), p(100, 100)])).toBe(0);
  });
});

describe('perimeter', () => {
  it('measures a closed square', () => {
    expect(perimeter(square)).toBe(4000);
  });

  it('returns zero for fewer than two points', () => {
    expect(perimeter([p(0, 0)])).toBe(0);
  });
});

describe('centroid', () => {
  it('finds the centre of a square', () => {
    expect(centroid(square)).toEqual(p(500, 500));
  });

  it('returns the origin for an empty polygon', () => {
    expect(centroid([])).toEqual(p(0, 0));
  });
});

describe('isClockwise', () => {
  it('reports winding direction in screen coordinates', () => {
    expect(isClockwise(square)).toBe(true);
    expect(isClockwise([...square].reverse())).toBe(false);
  });
});

describe('pointInPolygon', () => {
  it('accepts interior points', () => {
    expect(pointInPolygon(p(500, 500), square)).toBe(true);
  });

  it('rejects exterior points', () => {
    expect(pointInPolygon(p(1500, 500), square)).toBe(false);
    expect(pointInPolygon(p(-1, 500), square)).toBe(false);
  });

  it('treats boundary points as inside, so a table on the wall still counts', () => {
    expect(pointInPolygon(p(0, 500), square)).toBe(true);
    expect(pointInPolygon(p(1000, 500), square)).toBe(true);
    expect(pointInPolygon(p(0, 0), square)).toBe(true);
  });

  it('handles a concave room correctly', () => {
    const ell = [p(0, 0), p(2000, 0), p(2000, 1000), p(1000, 1000), p(1000, 2000), p(0, 2000)];
    expect(pointInPolygon(p(500, 1500), ell)).toBe(true); // in the tall arm
    expect(pointInPolygon(p(1500, 1500), ell)).toBe(false); // in the bite
  });

  it('is false for a degenerate polygon', () => {
    expect(pointInPolygon(p(0, 0), [p(0, 0), p(10, 10)])).toBe(false);
  });
});

describe('squareMmToSquareFeet', () => {
  it('converts a one-foot square, within the millimetre quantization error', () => {
    // feet(1) stores as 305 mm, not 304.8 — integer millimetres cannot hold an
    // exact foot. Squaring that 0.2 mm rounding inflates the area by ~0.13%.
    // Real and permanent, per ADR-0006; documented rather than tolerated
    // silently, because someone will eventually chase this decimal.
    expect(squareMmToSquareFeet(feet(1) * feet(1))).toBeCloseTo(1, 2);
  });

  it('is exact where the imperial value lands on a whole millimetre', () => {
    // 304.8 x 60 = 18288 exactly, so a 60 ft dimension carries no error at all.
    // Quantization only bites on values that do not divide evenly.
    expect(feet(60)).toBe(18288);
    expect(squareMmToSquareFeet(feet(60) * feet(60))).toBeCloseTo(3600, 6);
  });

  it('keeps linear quantization within half a millimetre', () => {
    // The bound the whole coordinate system rests on: no stored length is ever
    // more than 0.5 mm from its true value.
    for (const value of [1, 6, 27, 30, 36, 48, 54, 60, 72, 96]) {
      expect(Math.abs(inches(value) - value * 25.4)).toBeLessThanOrEqual(0.5);
    }
  });

  it('measures a real 60 x 40 ft ballroom', () => {
    const room = [p(0, 0), p(feet(60), 0), p(feet(60), feet(40)), p(0, feet(40))];
    expect(squareMmToSquareFeet(area(room))).toBeCloseTo(2400, 0);
  });

  it('agrees with the catalog on a 60-inch round table footprint', () => {
    const r = inches(60) / 2;
    const circleAreaMm2 = Math.PI * r * r;
    expect(squareMmToSquareFeet(circleAreaMm2)).toBeCloseTo(19.6, 1);
  });
});
