import { describe, it, expect } from 'vitest';
import { snapValue, snapPoint, snapAngle, alignmentGuides, DEFAULT_GRID_MM } from './snap';
import { inches } from './units';

const p = (x: number, y: number) => ({ x, y });

describe('snapValue', () => {
  it('snaps to the nearest multiple', () => {
    expect(snapValue(140, 100)).toBe(100);
    expect(snapValue(160, 100)).toBe(200);
    expect(snapValue(150, 100)).toBe(200);
  });

  it('handles negatives', () => {
    expect(snapValue(-140, 100)).toBe(-100);
    expect(snapValue(-160, 100)).toBe(-200);
  });

  it('is a no-op for a zero or negative grid', () => {
    expect(snapValue(137, 0)).toBe(137);
    expect(snapValue(137, -10)).toBe(137);
  });

  it('defaults to a 6-inch grid, which is how venues are laid out', () => {
    expect(DEFAULT_GRID_MM).toBe(inches(6));
  });
});

describe('snapPoint', () => {
  it('snaps both axes', () => {
    expect(snapPoint(p(140, 260), 100)).toEqual(p(100, 300));
  });
});

describe('snapAngle', () => {
  it('snaps to the nearest step', () => {
    expect(snapAngle(43, 15)).toBe(45);
    expect(snapAngle(7, 15)).toBe(0);
    expect(snapAngle(88, 45)).toBe(90);
  });

  it('normalizes the result into [0, 360)', () => {
    expect(snapAngle(359, 15)).toBe(0);
    expect(snapAngle(-44, 15)).toBe(315);
  });

  it('is a no-op for a zero step', () => {
    expect(snapAngle(37.4, 0)).toBe(37.4);
  });
});

describe('alignmentGuides', () => {
  const moving = { x: 1000, y: 1000, width: 500, height: 500 };

  it('finds a vertical guide when left edges nearly line up', () => {
    const others = [{ x: 1010, y: 5000, width: 500, height: 500 }];
    const guides = alignmentGuides(moving, others, 50);

    const vertical = guides.filter((g) => g.axis === 'x');
    expect(vertical.length).toBeGreaterThan(0);
    expect(vertical.some((g) => g.position === 1010)).toBe(true);
  });

  it('finds a horizontal guide when centres nearly line up', () => {
    const others = [{ x: 8000, y: 1005, width: 500, height: 500 }];
    const guides = alignmentGuides(moving, others, 50);

    const horizontal = guides.filter((g) => g.axis === 'y');
    expect(horizontal.some((g) => g.kind === 'center')).toBe(true);
  });

  it('finds nothing when everything is far apart', () => {
    const others = [{ x: 9000, y: 9000, width: 500, height: 500 }];
    expect(alignmentGuides(moving, others, 50)).toEqual([]);
  });

  it('respects the tolerance', () => {
    const others = [{ x: 1060, y: 5000, width: 500, height: 500 }];
    expect(alignmentGuides(moving, others, 50)).toEqual([]);
    expect(alignmentGuides(moving, others, 100).length).toBeGreaterThan(0);
  });

  it('returns the closest candidate first, so callers can take guides[0]', () => {
    const others = [
      { x: 1040, y: 5000, width: 500, height: 500 },
      { x: 1005, y: 6000, width: 500, height: 500 },
    ];
    const guides = alignmentGuides(moving, others, 50);
    expect(guides[0]?.position).toBe(1005);
  });

  it('ignores an empty candidate list', () => {
    expect(alignmentGuides(moving, [], 50)).toEqual([]);
  });
});
