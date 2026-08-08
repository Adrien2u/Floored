/**
 * Units — conversion, parsing, and display formatting.
 *
 * Every internal length in Floored is an **integer millimetre**. Screen pixels
 * and PDF points are derived projections computed at the edge; display units are
 * a formatting concern that lives here and nowhere else.
 *
 * See ADR-0006 for why.
 */

/** Exact international inch. Not an approximation. */
export const MM_PER_INCH = 25.4;
export const MM_PER_FOOT = 304.8;

/** Display preference. Affects presentation only, never stored geometry. */
export type UnitSystem = 'imperial' | 'metric';

/** Imperial display rounds to this fraction of an inch. */
const IMPERIAL_DENOMINATOR = 8;

/** Convert inches to integer millimetres. */
export function inches(value: number): number {
  return Math.round(value * MM_PER_INCH);
}

/** Convert feet to integer millimetres. */
export function feet(value: number): number {
  return Math.round(value * MM_PER_FOOT);
}

/** Convert millimetres back to (fractional) inches. For display and export only. */
export function toInches(mm: number): number {
  return mm / MM_PER_INCH;
}

function reduceFraction(numerator: number, denominator: number): [number, number] {
  let a = numerator;
  let b = denominator;
  while (b !== 0) [a, b] = [b, a % b];
  return [numerator / a, denominator / a];
}

/**
 * Format a millimetre length for display.
 *
 * Imperial output uses feet-inches with fractions to the nearest eighth, which
 * is how venue and furniture dimensions are actually quoted. Metric switches
 * from millimetres to metres at 1 m.
 */
export function formatLength(mm: number, system: UnitSystem): string {
  const sign = mm < 0 ? '-' : '';
  const magnitude = Math.abs(mm);

  if (system === 'metric') {
    if (magnitude < 1000) return `${sign}${Math.round(magnitude)} mm`;
    const metres = magnitude / 1000;
    // Three decimals keeps millimetre precision, so a displayed dimension can be
    // retyped without changing the plan. Trailing zeros trimmed, so 1000 reads
    // as "1 m" rather than "1.000 m". Two decimals would silently drop up to
    // 5 mm — unacceptable in a tool that promises to-scale output.
    return `${sign}${parseFloat(metres.toFixed(3)).toString()} m`;
  }

  // Work in eighths of an inch so rounding happens once, before splitting into
  // feet and inches. Rounding after the split lets 11.97" print as 0' 12".
  const totalEighths = Math.round((magnitude / MM_PER_INCH) * IMPERIAL_DENOMINATOR);
  const wholeInches = Math.floor(totalEighths / IMPERIAL_DENOMINATOR);
  const remainderEighths = totalEighths % IMPERIAL_DENOMINATOR;

  const ft = Math.floor(wholeInches / 12);
  const inch = wholeInches % 12;

  let inchPart = '';
  if (remainderEighths > 0) {
    const [num, den] = reduceFraction(remainderEighths, IMPERIAL_DENOMINATOR);
    inchPart = inch > 0 ? `${inch.toString()} ${num}/${den}"` : `${num}/${den}"`;
  } else if (inch > 0) {
    inchPart = `${inch.toString()}"`;
  }

  if (ft > 0) return inchPart ? `${sign}${ft}' ${inchPart}` : `${sign}${ft}'`;
  return inchPart ? `${sign}${inchPart}` : '0"';
}

const FEET_INCHES = /^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?\s*"?)?$/;
const INCHES_ONLY = /^(-?\d+(?:\.\d+)?)?\s*(?:(\d+)\/(\d+))?\s*(?:"|in|inch|inches)$/;
const SUFFIXED = /^(-?\d+(?:\.\d+)?)\s*(mm|cm|m|ft|foot|feet|in|inch|inches)$/;
const BARE = /^-?\d+(?:\.\d+)?$/;

/**
 * Parse a user-typed length into integer millimetres.
 *
 * Accepts what event planners actually write: `12'6"`, `12' 6 1/2"`, `150in`,
 * `12.5ft`, `600mm`, `1.5m`, `6 1/4"`. A bare number is interpreted using
 * `defaultSystem`.
 *
 * @returns millimetres, or `null` if the input cannot be understood. Callers
 *   must handle `null` — never coerce it to zero, which silently moves things.
 */
export function parseLength(input: string, defaultSystem: UnitSystem = 'metric'): number | null {
  const text = input.trim().toLowerCase();
  if (text === '') return null;

  const feetInches = FEET_INCHES.exec(text);
  if (feetInches) {
    const [, ftRaw, inchRaw, numRaw, denRaw] = feetInches;
    const ft = Number(ftRaw);
    const inch = inchRaw === undefined ? 0 : Number(inchRaw);
    const fraction = fractionValue(numRaw, denRaw);
    if (fraction === null) return null;
    const magnitude = Math.abs(ft) * 12 + inch + fraction;
    return inches(ft < 0 ? -magnitude : magnitude);
  }

  const inchOnly = INCHES_ONLY.exec(text);
  if (inchOnly) {
    const [, whole, numRaw, denRaw] = inchOnly;
    if (whole === undefined && numRaw === undefined) return null;
    const fraction = fractionValue(numRaw, denRaw);
    if (fraction === null) return null;
    const base = whole === undefined ? 0 : Number(whole);
    return inches(base < 0 ? base - fraction : base + fraction);
  }

  const suffixed = SUFFIXED.exec(text);
  if (suffixed) {
    const value = Number(suffixed[1]);
    switch (suffixed[2]) {
      case 'mm':
        return Math.round(value);
      case 'cm':
        return Math.round(value * 10);
      case 'm':
        return Math.round(value * 1000);
      case 'ft':
      case 'foot':
      case 'feet':
        return feet(value);
      default:
        return inches(value);
    }
  }

  if (BARE.test(text)) {
    const value = Number(text);
    return defaultSystem === 'metric' ? Math.round(value) : inches(value);
  }

  return null;
}

/** Returns the fraction's value, 0 when absent, or null when malformed. */
function fractionValue(numRaw: string | undefined, denRaw: string | undefined): number | null {
  if (numRaw === undefined || denRaw === undefined) return 0;
  const den = Number(denRaw);
  if (den === 0) return null;
  return Number(numRaw) / den;
}
