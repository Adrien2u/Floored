import { describe, it, expect } from 'vitest';
import { add, sub, scale, distance, midpoint, length, direction, equals, round } from './vec';

const p = (x: number, y: number) => ({ x, y });

describe('vector arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(p(100, 200), p(50, -25))).toEqual(p(150, 175));
    expect(sub(p(100, 200), p(50, -25))).toEqual(p(50, 225));
  });

  it('scales and rounds back to integer millimetres', () => {
    expect(scale(p(100, 200), 2)).toEqual(p(200, 400));
    expect(scale(p(101, 201), 0.5)).toEqual(p(51, 101));
  });

  it('measures distance', () => {
    expect(distance(p(0, 0), p(300, 400))).toBe(500);
    expect(distance(p(0, 0), p(0, 0))).toBe(0);
  });

  it('finds the midpoint on integer millimetres', () => {
    expect(midpoint(p(0, 0), p(1000, 500))).toEqual(p(500, 250));
    expect(midpoint(p(0, 0), p(999, 0))).toEqual(p(500, 0)); // 499.5 rounds up
  });

  it('measures length from the origin', () => {
    expect(length(p(300, 400))).toBe(500);
  });

  it('returns a unit direction vector', () => {
    const d = direction(p(0, 0), p(0, 1000));
    expect(d.x).toBeCloseTo(0, 10);
    expect(d.y).toBeCloseTo(1, 10);
  });

  it('returns a zero direction for coincident points rather than NaN', () => {
    expect(direction(p(5, 5), p(5, 5))).toEqual({ x: 0, y: 0 });
  });

  it('compares points exactly, since millimetres are integers', () => {
    expect(equals(p(10, 20), p(10, 20))).toBe(true);
    expect(equals(p(10, 20), p(10, 21))).toBe(false);
  });

  it('rounds a fractional point to integer millimetres', () => {
    expect(round({ x: 10.4, y: 10.6 })).toEqual(p(10, 11));
    expect(round({ x: -10.4, y: -10.6 })).toEqual(p(-10, -11));
  });
});
