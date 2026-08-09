/**
 * Capacity and clearance analysis.
 *
 * Turns a plan into the numbers a planner would otherwise work out by hand:
 * how many seats, how many people the room may legally hold, and which gaps are
 * too narrow for a server with a tray or a guest leaving a table.
 *
 * **None of this is a code determination.** It produces estimates and warnings;
 * the authority having jurisdiction decides. The wording of every user-facing
 * string that comes from here has to keep saying so.
 */

import type { FlooredDocument } from '$lib/document/document';
import { roomAreaMm2, totalSeats } from '$lib/document/document';
import type { ElementId, FloorElement } from '$lib/document/element';
import { elementBounds, seatCount } from '$lib/document/element';
import type { Point } from '$lib/geometry/vec';
import {
  CLEARANCE,
  gapBetweenCircles,
  gradeTableGap,
  occupantLoad,
  type ClearanceSeverity,
} from '$lib/geometry/clearance';
import { squareMmToSquareFeet } from '$lib/geometry/polygon';

export interface ClearanceIssue {
  readonly between: readonly [ElementId, ElementId];
  readonly gapMm: number;
  readonly requiredMm: number;
  readonly severity: Exclude<ClearanceSeverity, 'ok'>;
  /** Midpoint of the gap, for drawing the warning on the plan. */
  readonly atMm: Point;
}

export interface CapacityReport {
  readonly seats: number;
  readonly tables: number;
  /** Net floor area of every room in the plan. */
  readonly roomAreaSqFt: number;
  /** NFPA 101 estimate for unconcentrated (tables and chairs) use. */
  readonly occupantLoad: number;
  /** True when seats exceed the estimated occupant load. */
  readonly overCapacity: boolean;
  readonly issues: readonly ClearanceIssue[];
}

/**
 * Every table-to-table gap that falls short.
 *
 * Only round tables are checked pairwise. Rectangular tables and fixtures have
 * orientation, so the shortest distance between them is not a centre-to-centre
 * calculation — that is a polygon-distance problem, and reporting a wrong
 * warning is worse than reporting none. Rectangular clearance arrives with the
 * measure tool rather than being guessed at here.
 */
export function clearanceIssues(doc: FlooredDocument): ClearanceIssue[] {
  const rounds = doc.elements.filter(
    (e): e is Extract<FloorElement, { type: 'roundTable' }> => e.type === 'roundTable'
  );

  const issues: ClearanceIssue[] = [];

  for (let i = 0; i < rounds.length; i++) {
    for (let j = i + 1; j < rounds.length; j++) {
      const a = rounds[i];
      const b = rounds[j];
      if (!a || !b) continue;

      const gapMm = gapBetweenCircles(a.center, a.diameterMm / 2, b.center, b.diameterMm / 2);

      // Tables far apart are not "clearance" in any meaningful sense — every
      // table in a ballroom is more than 54" from most of the others, and
      // reporting those would bury the real problems.
      if (gapMm > CLEARANCE.betweenTablesComfortable) continue;

      const grade = gradeTableGap(gapMm);
      if (grade.severity === 'ok') continue;

      issues.push({
        between: [a.id, b.id],
        gapMm,
        requiredMm: grade.requiredMm ?? CLEARANCE.betweenTablesMin,
        severity: grade.severity,
        atMm: {
          x: Math.round((a.center.x + b.center.x) / 2),
          y: Math.round((a.center.y + b.center.y) / 2),
        },
      });
    }
  }

  // Worst first, so a user fixing one problem at a time fixes the worst one.
  return issues.sort((p, q) => p.gapMm - q.gapMm);
}

/** Everything the capacity panel shows, computed in one pass. */
export function capacityReport(doc: FlooredDocument): CapacityReport {
  const areaMm2 = roomAreaMm2(doc);
  const seats = totalSeats(doc);
  const load = occupantLoad(areaMm2);

  return {
    seats,
    tables: doc.elements.filter((e) => seatCount(e) > 0).length,
    roomAreaSqFt: Math.round(squareMmToSquareFeet(areaMm2)),
    occupantLoad: load,
    // Only meaningful once a room has been drawn; with no room the load is zero
    // and every plan would look over capacity.
    overCapacity: areaMm2 > 0 && seats > load,
    issues: clearanceIssues(doc),
  };
}

/**
 * Do any two elements physically overlap?
 *
 * Distinct from a clearance warning: overlapping furniture is a mistake, not a
 * tight fit, and it is worth saying so in different words.
 */
export function overlappingPairs(doc: FlooredDocument): [ElementId, ElementId][] {
  const solid = doc.elements.filter((e) => e.type !== 'room' && e.type !== 'note');
  const pairs: [ElementId, ElementId][] = [];

  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i];
      const b = solid[j];
      if (!a || !b) continue;

      // Round tables overlap when their circles do, not their boxes — two
      // rounds set corner to corner have overlapping bounds and plenty of room.
      if (a.type === 'roundTable' && b.type === 'roundTable') {
        if (gapBetweenCircles(a.center, a.diameterMm / 2, b.center, b.diameterMm / 2) < 0) {
          pairs.push([a.id, b.id]);
        }
        continue;
      }

      const ba = elementBounds(a);
      const bb = elementBounds(b);
      const overlaps =
        ba.x < bb.x + bb.width &&
        bb.x < ba.x + ba.width &&
        ba.y < bb.y + bb.height &&
        bb.y < ba.y + ba.height;
      if (overlaps) pairs.push([a.id, b.id]);
    }
  }

  return pairs;
}
