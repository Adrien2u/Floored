import { describe, it, expect } from 'vitest';
import { capacityReport, clearanceIssues, overlappingPairs } from './capacity';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';
import { CLEARANCE } from '$lib/geometry/clearance';

const table = (id: string, x: number, y: number, diameterInches = 60): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id,
  center: { x, y },
  diameterMm: inches(diameterInches),
  seats: 8,
});

const room = (widthFeet: number, depthFeet: number): FloorElement => ({
  id: 'room',
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: true,
  label: 'Ballroom',
  points: [
    { x: 0, y: 0 },
    { x: feet(widthFeet), y: 0 },
    { x: feet(widthFeet), y: feet(depthFeet) },
    { x: 0, y: feet(depthFeet) },
  ],
});

function planWith(...elements: FloorElement[]): FlooredDocument {
  let doc = createDocument();
  for (const e of elements) doc = addElement(doc, e);
  return doc;
}

/** Two 60" rounds whose edges are `gapInches` apart. */
function pairAtGap(gapInches: number): FlooredDocument {
  return planWith(table('a', 0, 0), table('b', inches(60) + inches(gapInches), 0));
}

describe('clearance issues', () => {
  it('flags a gap below the 54-inch minimum', () => {
    const issues = clearanceIssues(pairAtGap(48));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('violation');
    expect(issues[0]?.requiredMm).toBe(CLEARANCE.betweenTablesMin);
  });

  it('calls 54 to 60 inches tight rather than a violation', () => {
    const issues = clearanceIssues(pairAtGap(56));
    expect(issues[0]?.severity).toBe('tight');
  });

  it('says nothing about a comfortable gap', () => {
    expect(clearanceIssues(pairAtGap(60))).toEqual([]);
    expect(clearanceIssues(pairAtGap(72))).toEqual([]);
  });

  it('ignores tables that are simply far apart', () => {
    // Every table in a ballroom is more than 54" from most of the others.
    // Reporting those would bury the real problems.
    const doc = planWith(table('a', 0, 0), table('b', feet(40), 0));
    expect(clearanceIssues(doc)).toEqual([]);
  });

  it('names both tables involved', () => {
    const issues = clearanceIssues(pairAtGap(40));
    expect(issues[0]?.between).toEqual(['a', 'b']);
  });

  it('locates the warning between the two tables, for the overlay', () => {
    const issues = clearanceIssues(pairAtGap(40));
    const midpoint = (inches(60) + inches(40)) / 2;
    expect(issues[0]?.atMm.x).toBe(Math.round(midpoint));
  });

  it('reports the worst gap first', () => {
    const doc = planWith(
      table('a', 0, 0),
      table('b', inches(60) + inches(50), 0), // 50" — tight-to-violation
      table('c', 0, inches(60) + inches(20)) // 20" — much worse
    );
    const issues = clearanceIssues(doc);
    expect(issues.length).toBeGreaterThan(1);
    expect(issues[0]?.between).toContain('c');
  });

  it('checks every pair, not just neighbours in the list', () => {
    const doc = planWith(
      table('a', 0, 0),
      table('far', feet(50), 0),
      table('c', inches(60) + inches(30), 0)
    );
    expect(clearanceIssues(doc).some((i) => i.between.includes('c'))).toBe(true);
  });

  it('has nothing to say about a plan with one table', () => {
    expect(clearanceIssues(planWith(table('a', 0, 0)))).toEqual([]);
  });
});

describe('capacity report', () => {
  it('counts seats and tables', () => {
    const doc = planWith(room(60, 40), table('a', 3000, 3000), table('b', 9000, 3000));
    const report = capacityReport(doc);

    expect(report.seats).toBe(16);
    expect(report.tables).toBe(2);
  });

  it('measures the room in square feet', () => {
    const report = capacityReport(planWith(room(60, 40)));
    expect(report.roomAreaSqFt).toBe(2400);
  });

  it('estimates the occupant load from net area', () => {
    // 2400 sq ft / 15 sq ft per person, unconcentrated.
    const report = capacityReport(planWith(room(60, 40)));
    expect(report.occupantLoad).toBe(160);
  });

  it('flags a plan seating more people than the room may hold', () => {
    let doc = planWith(room(20, 20)); // 400 sq ft, load 26
    for (let i = 0; i < 5; i++) doc = addElement(doc, table(`t${String(i)}`, i * 3000, 0));

    const report = capacityReport(doc);
    expect(report.seats).toBe(40);
    expect(report.occupantLoad).toBe(26);
    expect(report.overCapacity).toBe(true);
  });

  it('does not call a plan over capacity before a room is drawn', () => {
    // With no room the load is zero, and every plan would look illegal.
    const report = capacityReport(planWith(table('a', 0, 0)));
    expect(report.overCapacity).toBe(false);
  });

  it('reports an empty plan as empty rather than failing', () => {
    const report = capacityReport(createDocument());
    expect(report.seats).toBe(0);
    expect(report.occupantLoad).toBe(0);
    expect(report.issues).toEqual([]);
  });

  it('includes the clearance issues', () => {
    const doc = addElement(pairAtGap(40), room(60, 40));
    expect(capacityReport(doc).issues.length).toBeGreaterThan(0);
  });
});

describe('overlap detection', () => {
  it('finds two round tables sitting on top of each other', () => {
    const doc = planWith(table('a', 0, 0), table('b', inches(30), 0));
    expect(overlappingPairs(doc)).toEqual([['a', 'b']]);
  });

  it('does not call touching tables an overlap', () => {
    const doc = planWith(table('a', 0, 0), table('b', inches(60), 0));
    expect(overlappingPairs(doc)).toEqual([]);
  });

  it('uses circles, not boxes, for two rounds', () => {
    // Corner to corner, the bounding boxes overlap and the tables do not.
    const doc = planWith(table('a', 0, 0), table('b', inches(50), inches(50)));
    expect(overlappingPairs(doc)).toEqual([]);
  });

  it('ignores the room, which contains everything by design', () => {
    const doc = planWith(room(60, 40), table('a', 3000, 3000));
    expect(overlappingPairs(doc)).toEqual([]);
  });

  it('ignores notes, which have no physical footprint', () => {
    const doc = planWith(table('a', 0, 0), {
      id: 'n',
      type: 'note',
      layer: 'annotations',
      rotationDeg: 0,
      locked: false,
      label: '',
      origin: { x: 0, y: 0 },
      text: 'here',
    });
    expect(overlappingPairs(doc)).toEqual([]);
  });

  it('catches a table sitting on the dancefloor', () => {
    const doc = planWith(table('a', 3000, 3000), {
      id: 'df',
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: 'Dancefloor',
      kind: 'dancefloor',
      origin: { x: 2000, y: 2000 },
      widthMm: feet(16),
      depthMm: feet(16),
    });
    expect(overlappingPairs(doc)).toHaveLength(1);
  });
});
