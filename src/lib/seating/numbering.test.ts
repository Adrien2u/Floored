import { describe, it, expect } from 'vitest';
import {
  numberingOrder,
  numberingLabels,
  patternName,
  DEFAULT_NUMBERING,
  NUMBERING_PATTERNS,
  type NumberingOptions,
} from './numbering';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';

const table = (id: string, x: number, y: number): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: '',
  center: { x, y },
  diameterMm: inches(60),
  seats: 8,
});

/** A tidy 3 x 2 grid, spaced like a real banquet room. */
function grid(): FlooredDocument {
  let doc = createDocument();
  const pitch = feet(10);

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      doc = addElement(doc, table(`r${String(row)}c${String(col)}`, col * pitch, row * pitch));
    }
  }
  return doc;
}

const opts = (over: Partial<NumberingOptions> = {}): NumberingOptions => ({
  ...DEFAULT_NUMBERING,
  ...over,
});

describe('patterns', () => {
  it('numbers left to right, top to bottom', () => {
    expect(numberingOrder(grid(), opts({ pattern: 'leftToRight' }))).toEqual([
      'r0c0',
      'r0c1',
      'r0c2',
      'r1c0',
      'r1c1',
      'r1c2',
    ]);
  });

  it('numbers right to left', () => {
    expect(numberingOrder(grid(), opts({ pattern: 'rightToLeft' }))).toEqual([
      'r0c2',
      'r0c1',
      'r0c0',
      'r1c2',
      'r1c1',
      'r1c0',
    ]);
  });

  it('snakes: rightward, then leftward on the next row', () => {
    expect(numberingOrder(grid(), opts({ pattern: 'snake' }))).toEqual([
      'r0c0',
      'r0c1',
      'r0c2',
      'r1c2',
      'r1c1',
      'r1c0',
    ]);
  });

  it('snakes from the right', () => {
    expect(numberingOrder(grid(), opts({ pattern: 'reverseSnake' }))).toEqual([
      'r0c2',
      'r0c1',
      'r0c0',
      'r1c0',
      'r1c1',
      'r1c2',
    ]);
  });

  it('numbers down columns for a long narrow room', () => {
    expect(numberingOrder(grid(), opts({ pattern: 'columnMajor' }))).toEqual([
      'r0c0',
      'r1c0',
      'r0c1',
      'r1c1',
      'r0c2',
      'r1c2',
    ]);
  });

  it('names every pattern for the UI', () => {
    for (const pattern of NUMBERING_PATTERNS) {
      expect(patternName(pattern).length).toBeGreaterThan(0);
    }
  });
});

describe('rows are inferred, not declared', () => {
  // A real plan is never a perfect grid: tables get nudged around a dancefloor.

  it('keeps a nudged table in its row', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a', 0, 0));
    doc = addElement(doc, table('b', feet(10), 300)); // 300 mm low
    doc = addElement(doc, table('c', feet(20), 0));

    expect(numberingOrder(doc, opts({ pattern: 'leftToRight' }))).toEqual(['a', 'b', 'c']);
  });

  it('starts a new row when the gap exceeds the tolerance', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a', 0, 0));
    doc = addElement(doc, table('b', feet(10), feet(20))); // far below

    const order = numberingOrder(doc, opts({ pattern: 'leftToRight' }));
    expect(order).toEqual(['a', 'b']);
  });

  it('honours a custom tolerance', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a', feet(10), 0));
    doc = addElement(doc, table('b', 0, 2000)); // 2 m below, left of a

    // A generous tolerance treats them as one row, so x decides: b then a.
    expect(numberingOrder(doc, opts({ rowToleranceMm: 3000 }))).toEqual(['b', 'a']);
    // A tight tolerance makes them separate rows, so y decides: a then b.
    expect(numberingOrder(doc, opts({ rowToleranceMm: 500 }))).toEqual(['a', 'b']);
  });
});

describe('labels', () => {
  it('prefixes and numbers in order', () => {
    const labels = numberingLabels(grid(), opts({ pattern: 'leftToRight' }));
    expect(labels.get('r0c0')).toBe('T1');
    expect(labels.get('r0c2')).toBe('T3');
    expect(labels.get('r1c0')).toBe('T4');
  });

  it('starts at a chosen number, for venues that reserve 1 for the head table', () => {
    const labels = numberingLabels(grid(), opts({ startAt: 101 }));
    expect(labels.get('r0c0')).toBe('T101');
  });

  it('accepts an empty prefix', () => {
    const labels = numberingLabels(grid(), opts({ prefix: '' }));
    expect(labels.get('r0c0')).toBe('1');
  });
});

describe('what counts as a table', () => {
  it('numbers only elements that seat people', () => {
    let doc = grid();
    doc = addElement(doc, {
      id: 'dancefloor',
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: 'Dancefloor',
      kind: 'dancefloor',
      origin: { x: 0, y: 0 },
      widthMm: feet(16),
      depthMm: feet(16),
    });

    expect(numberingOrder(doc)).toHaveLength(6);
  });

  it('includes seating blocks, which seat people too', () => {
    let doc = createDocument();
    doc = addElement(doc, {
      id: 'ceremony',
      type: 'seatingBlock',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: '',
      origin: { x: 0, y: 0 },
      rows: 4,
      columns: 6,
      seatPitchMm: inches(22),
      rowPitchMm: inches(36),
    });

    expect(numberingOrder(doc)).toEqual(['ceremony']);
  });

  it('returns nothing for a plan with no tables', () => {
    expect(numberingOrder(createDocument())).toEqual([]);
    expect(numberingLabels(createDocument()).size).toBe(0);
  });
});

describe('numbering is derived, never stored', () => {
  // The rule from ADR-0013: no shadow mapping alongside the truth. Applying a
  // scheme changes labels; moving guests is a separate operation.

  it('does not modify the document', () => {
    const doc = grid();
    const before = JSON.stringify(doc);

    numberingOrder(doc);
    numberingLabels(doc);

    expect(JSON.stringify(doc)).toBe(before);
  });

  it('gives the same answer every time for the same positions', () => {
    const doc = grid();
    expect(numberingOrder(doc)).toEqual(numberingOrder(doc));
  });

  it('follows the tables when they move, with no state to go stale', () => {
    let doc = createDocument();
    doc = addElement(doc, table('left', 0, 0));
    doc = addElement(doc, table('right', feet(10), 0));

    expect(numberingLabels(doc).get('left')).toBe('T1');

    // Move 'left' to the right of 'right'. Its number follows its position.
    const moved = {
      ...doc,
      elements: doc.elements.map((e) =>
        e.id === 'left' && e.type === 'roundTable' ? { ...e, center: { x: feet(20), y: 0 } } : e
      ),
    };

    expect(numberingLabels(moved).get('left')).toBe('T2');
    expect(numberingLabels(moved).get('right')).toBe('T1');
  });
});
