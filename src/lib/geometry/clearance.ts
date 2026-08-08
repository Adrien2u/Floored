/**
 * Clearances and occupant load.
 *
 * The constants here are the reason a professional can trust the tool. They come
 * from published standards and industry practice, not from taste — see
 * docs/RESEARCH.md §3 for the sources behind every number.
 *
 * Nothing in this module is a code determination. It produces estimates and
 * warnings; the authority having jurisdiction decides.
 */

import type { Point } from './vec';
import { distance } from './vec';
import { inches } from './units';
import { squareMmToSquareFeet } from './polygon';

/** Published clearance minimums, in millimetres. */
export const CLEARANCE = {
  /** 2010 ADA Standards §403.5.1 — minimum accessible route width. */
  adaAisleMin: inches(36),
  /** Service and egress practice: room for staff with trays, and exit flow. */
  serviceAisle: inches(60),
  /** Minimum gap between round tables. */
  betweenTablesMin: inches(54),
  /** Comfortable gap between round tables. */
  betweenTablesComfortable: inches(60),
  /** Needed where chairs have arms or centrepieces are tall. */
  betweenTablesGenerous: inches(72),
  /** ADA knee clearance beneath a table surface. */
  adaKneeClearance: inches(27),
} as const;

/** NFPA 101 occupant load factors, in square feet per person. */
export const OCCUPANT_LOAD_SQ_FT = {
  /** Tables and chairs — the normal banquet case. */
  unconcentrated: 15,
  /** No fixed seating, standing or close-packed. */
  concentrated: 7,
} as const;

export type OccupancyKind = keyof typeof OCCUPANT_LOAD_SQ_FT;

export type ClearanceSeverity = 'ok' | 'tight' | 'violation';

export interface ClearanceResult {
  readonly gapMm: number;
  readonly severity: ClearanceSeverity;
  /** Present only when the gap falls short; the standard it failed against. */
  readonly requiredMm?: number;
}

/**
 * Edge-to-edge gap between two circular tables.
 *
 * Returns a negative number when the tables overlap, which callers should treat
 * as a placement error rather than a clearance warning.
 */
export function gapBetweenCircles(
  centerA: Point,
  radiusAMm: number,
  centerB: Point,
  radiusBMm: number
): number {
  return Math.round(distance(centerA, centerB) - radiusAMm - radiusBMm);
}

/**
 * Grade a gap between two round tables.
 *
 * - below 54" is a violation: staff cannot pass and seated guests cannot leave
 * - 54" to 60" is tight but workable
 * - 60" and above is fine
 */
export function gradeTableGap(gapMm: number): ClearanceResult {
  if (gapMm < CLEARANCE.betweenTablesMin) {
    return {
      gapMm,
      severity: 'violation',
      requiredMm: CLEARANCE.betweenTablesMin,
    };
  }
  if (gapMm < CLEARANCE.betweenTablesComfortable) {
    return {
      gapMm,
      severity: 'tight',
      requiredMm: CLEARANCE.betweenTablesComfortable,
    };
  }
  return { gapMm, severity: 'ok' };
}

/**
 * Grade an aisle width.
 *
 * The ADA minimum is the hard floor — below it the route is not accessible.
 * Between the ADA minimum and the 60" service width the aisle is legal but
 * will not comfortably take a server with a tray.
 */
export function gradeAisle(widthMm: number): ClearanceResult {
  if (widthMm < CLEARANCE.adaAisleMin) {
    return { gapMm: widthMm, severity: 'violation', requiredMm: CLEARANCE.adaAisleMin };
  }
  if (widthMm < CLEARANCE.serviceAisle) {
    return { gapMm: widthMm, severity: 'tight', requiredMm: CLEARANCE.serviceAisle };
  }
  return { gapMm: widthMm, severity: 'ok' };
}

/**
 * NFPA 101 occupant load estimate.
 *
 * `netAreaMm2` must already exclude corridors, stairs, restrooms, mechanical
 * rooms, and fixed equipment — the standard is defined on *net* floor area, and
 * passing gross area produces a number that is confidently too high.
 *
 * Rounded down: you may not round a life-safety limit up.
 */
export function occupantLoad(netAreaMm2: number, kind: OccupancyKind = 'unconcentrated'): number {
  if (netAreaMm2 <= 0) return 0;
  return Math.floor(squareMmToSquareFeet(netAreaMm2) / OCCUPANT_LOAD_SQ_FT[kind]);
}

/** Square feet of floor area a seated guest needs, per industry planning practice. */
export const BANQUET_SQ_FT_PER_GUEST = { min: 10, comfortable: 12 } as const;

/**
 * How many guests a room comfortably seats, by area alone.
 *
 * A planning heuristic for sizing a room before any tables are placed — not a
 * substitute for laying the plan out and counting the seats.
 */
export function seatingCapacityByArea(
  netAreaMm2: number,
  comfort: keyof typeof BANQUET_SQ_FT_PER_GUEST = 'comfortable'
): number {
  if (netAreaMm2 <= 0) return 0;
  return Math.floor(squareMmToSquareFeet(netAreaMm2) / BANQUET_SQ_FT_PER_GUEST[comfort]);
}
