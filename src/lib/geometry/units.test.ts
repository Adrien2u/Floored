import { describe, it, expect } from 'vitest';
import {
  MM_PER_INCH,
  MM_PER_FOOT,
  formatLength,
  parseLength,
  inches,
  feet,
  toInches,
} from './units';

describe('constants', () => {
  it('uses the exact international inch', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(MM_PER_FOOT).toBe(304.8);
  });
});

describe('inches / feet constructors', () => {
  it('converts to integer millimetres', () => {
    expect(inches(60)).toBe(1524); // 60" round table
    expect(feet(8)).toBe(2438); // 8ft banquet table, rounded from 2438.4
    expect(inches(36)).toBe(914); // ADA minimum aisle
  });

  it('rounds to the nearest millimetre rather than truncating', () => {
    expect(inches(1)).toBe(25); // 25.4 -> 25
    expect(inches(3)).toBe(76); // 76.2 -> 76
    expect(inches(0.5)).toBe(13); // 12.7 -> 13
  });

  it('handles negatives symmetrically', () => {
    expect(inches(-60)).toBe(-1524);
  });
});

describe('toInches', () => {
  it('round-trips the domain constants', () => {
    expect(toInches(inches(60))).toBeCloseTo(60, 1);
    expect(toInches(inches(54))).toBeCloseTo(54, 1);
    expect(toInches(inches(27))).toBeCloseTo(27, 1);
  });
});

describe('formatLength — metric', () => {
  it('uses millimetres below one metre', () => {
    expect(formatLength(600, 'metric')).toBe('600 mm');
    expect(formatLength(999, 'metric')).toBe('999 mm');
  });

  it('uses metres at one metre and above', () => {
    expect(formatLength(1000, 'metric')).toBe('1 m');
    expect(formatLength(1500, 'metric')).toBe('1.5 m');
  });

  it('keeps millimetre precision so a displayed value can be retyped', () => {
    // Two decimals would render 1524 as "1.52 m", which parses back as 1520 —
    // a silent 4 mm loss. Not acceptable in a to-scale tool.
    expect(formatLength(1524, 'metric')).toBe('1.524 m');
    expect(formatLength(2438, 'metric')).toBe('2.438 m');
  });

  it('formats zero and negatives', () => {
    expect(formatLength(0, 'metric')).toBe('0 mm');
    expect(formatLength(-600, 'metric')).toBe('-600 mm');
  });
});

describe('formatLength — imperial', () => {
  it('formats whole feet without a stray inch part', () => {
    expect(formatLength(inches(60), 'imperial')).toBe("5'");
    expect(formatLength(feet(8), 'imperial')).toBe("8'");
  });

  it('formats feet and inches', () => {
    expect(formatLength(inches(66), 'imperial')).toBe('5\' 6"');
    expect(formatLength(inches(30), 'imperial')).toBe('2\' 6"');
  });

  it('formats inches only below one foot', () => {
    expect(formatLength(inches(6), 'imperial')).toBe('6"');
    expect(formatLength(inches(11), 'imperial')).toBe('11"');
  });

  it('rounds to the nearest eighth of an inch', () => {
    expect(formatLength(inches(6.5), 'imperial')).toBe('6 1/2"');
    expect(formatLength(inches(6.25), 'imperial')).toBe('6 1/4"');
    expect(formatLength(inches(6.125), 'imperial')).toBe('6 1/8"');
    expect(formatLength(inches(6.375), 'imperial')).toBe('6 3/8"');
  });

  it('carries a rounded eighth up into the next inch and foot', () => {
    // 11.97" rounds to 12" which must become 1', not 0' 12"
    expect(formatLength(Math.round(11.97 * MM_PER_INCH), 'imperial')).toBe("1'");
  });

  it('formats zero and negatives', () => {
    expect(formatLength(0, 'imperial')).toBe('0"');
    expect(formatLength(inches(-66), 'imperial')).toBe('-5\' 6"');
  });
});

describe('parseLength', () => {
  it('parses feet-and-inches notation planners actually type', () => {
    expect(parseLength('12\'6"')).toBe(inches(150));
    expect(parseLength('12\' 6"')).toBe(inches(150));
    expect(parseLength("12'6")).toBe(inches(150));
    expect(parseLength("5'")).toBe(inches(60));
  });

  it('parses mixed fractions', () => {
    expect(parseLength('12\' 6 1/2"')).toBe(inches(150.5));
    expect(parseLength('6 1/4"')).toBe(inches(6.25));
    expect(parseLength('1/2"')).toBe(inches(0.5));
  });

  it('parses unit suffixes', () => {
    expect(parseLength('150in')).toBe(inches(150));
    expect(parseLength('12.5ft')).toBe(inches(150));
    expect(parseLength('600mm')).toBe(600);
    expect(parseLength('1.5m')).toBe(1500);
    expect(parseLength('60cm')).toBe(600);
  });

  it('is tolerant of whitespace and case', () => {
    expect(parseLength('  600 MM  ')).toBe(600);
    expect(parseLength('12.5 FT')).toBe(inches(150));
  });

  it('uses the default system for a bare number', () => {
    expect(parseLength('600', 'metric')).toBe(600);
    expect(parseLength('60', 'imperial')).toBe(inches(60));
  });

  it('returns null for input it cannot understand', () => {
    expect(parseLength('')).toBeNull();
    expect(parseLength('abc')).toBeNull();
    expect(parseLength('12 feet-ish')).toBeNull();
    expect(parseLength('1/0"')).toBeNull();
  });

  it('round-trips through formatLength', () => {
    for (const mm of [1524, 2438, 914, 600, 1000]) {
      expect(parseLength(formatLength(mm, 'metric'))).toBe(mm);
    }
  });
});
