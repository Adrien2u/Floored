import { describe, it, expect } from 'vitest';
import {
  elementsInBounds,
  elementsInMarquee,
  elementAt,
  hitsElement,
  seatPositions,
  padRect,
  SEAT_OFFSET_MM,
  NOTE_HIT_RADIUS_MM,
} from './scene';
import { createDocument, addElement } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';
import { distance } from '$lib/geometry/vec';

const table = (id: string, x: number, y: number): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id,
  center: { x, y },
  diameterMm: inches(60),
  seats: 8,
});

const room: FloorElement = {
  id: 'room',
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: true,
  label: 'Ballroom',
  points: [
    { x: 0, y: 0 },
    { x: feet(60), y: 0 },
    { x: feet(60), y: feet(40) },
    { x: 0, y: feet(40) },
  ],
};

describe('culling', () => {
  it('returns only elements overlapping the region', () => {
    let doc = createDocument();
    doc = addElement(doc, table('near', 1000, 1000));
    doc = addElement(doc, table('far', 50000, 50000));

    const visible = elementsInBounds(doc, { x: 0, y: 0, width: 5000, height: 5000 });
    expect(visible.map((e) => e.id)).toEqual(['near']);
  });

  it('includes an element straddling the edge', () => {
    const doc = addElement(createDocument(), table('edge', 5000, 1000));
    const visible = elementsInBounds(doc, { x: 0, y: 0, width: 4500, height: 5000 });
    expect(visible.map((e) => e.id)).toEqual(['edge']);
  });

  it('preserves draw order', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a', 0, 0));
    doc = addElement(doc, table('b', 100, 0));
    doc = addElement(doc, table('c', 200, 0));

    const visible = elementsInBounds(doc, { x: -5000, y: -5000, width: 20000, height: 20000 });
    expect(visible.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('skips hidden layers', () => {
    let doc = createDocument();
    doc = addElement(doc, room);
    doc = addElement(doc, table('t', 1000, 1000));

    const visible = elementsInBounds(
      doc,
      { x: -5000, y: -5000, width: 50000, height: 50000 },
      new Set(['room'])
    );
    expect(visible.map((e) => e.id)).toEqual(['t']);
  });

  it('pads a region on every side', () => {
    expect(padRect({ x: 100, y: 100, width: 200, height: 200 }, 50)).toEqual({
      x: 50,
      y: 50,
      width: 300,
      height: 300,
    });
  });
});

describe('hit-testing shapes', () => {
  it('tests a round table against its circle, not its bounding box', () => {
    const t = table('t', 0, 0);
    const r = inches(60) / 2;

    expect(hitsElement(t, { x: 0, y: 0 })).toBe(true);
    expect(hitsElement(t, { x: r - 1, y: 0 })).toBe(true);
    // The bounding-box corner is outside the circle by a wide margin.
    expect(hitsElement(t, { x: r - 1, y: r - 1 })).toBe(false);
  });

  it('tests a room against its polygon', () => {
    expect(hitsElement(room, { x: 1000, y: 1000 })).toBe(true);
    expect(hitsElement(room, { x: feet(70), y: 1000 })).toBe(false);
  });

  it('accounts for rotation on a rectangular table', () => {
    const rect: FloorElement = {
      id: 'r',
      type: 'rectTable',
      layer: 'furniture',
      rotationDeg: 90,
      locked: false,
      label: '',
      origin: { x: 0, y: 0 },
      widthMm: 2400,
      depthMm: 800,
      seats: 8,
    };

    // Rotated a quarter turn about its centre, the table now runs vertically.
    // A point far along the original long axis is no longer on the table.
    expect(hitsElement(rect, { x: 2300, y: 400 })).toBe(false);
    expect(hitsElement(rect, { x: 1200, y: 1500 })).toBe(true);
  });

  it('gives a note a fixed-size target, since its extent depends on the font', () => {
    const note: FloorElement = {
      id: 'n',
      type: 'note',
      layer: 'annotations',
      rotationDeg: 0,
      locked: false,
      label: '',
      origin: { x: 1000, y: 1000 },
      text: 'Load-in via north door',
    };

    expect(hitsElement(note, { x: 1000, y: 1000 })).toBe(true);
    expect(hitsElement(note, { x: 1000 + NOTE_HIT_RADIUS_MM * 2, y: 1000 })).toBe(false);
  });
});

describe('elementAt', () => {
  it('returns nothing on empty space', () => {
    const doc = addElement(createDocument(), table('t', 0, 0));
    expect(elementAt(doc, { x: 90000, y: 90000 })).toBeUndefined();
  });

  it('picks the topmost element when they overlap', () => {
    let doc = createDocument();
    doc = addElement(doc, table('under', 1000, 1000));
    doc = addElement(doc, table('over', 1000, 1000));

    expect(elementAt(doc, { x: 1000, y: 1000 })?.id).toBe('over');
  });

  it('prefers furniture over the room that contains it', () => {
    // The room polygon covers everything inside it. A naive topmost-first
    // search over a plan whose room sits above the furniture in draw order
    // would select the room on every single click.
    let doc = createDocument();
    doc = addElement(doc, table('t', 3000, 3000));
    doc = addElement(doc, room);

    expect(elementAt(doc, { x: 3000, y: 3000 })?.id).toBe('t');
  });

  it('still selects the room when nothing else is under the pointer', () => {
    let doc = createDocument();
    doc = addElement(doc, room);
    doc = addElement(doc, table('t', 3000, 3000));

    expect(elementAt(doc, { x: 10000, y: 8000 })?.id).toBe('room');
  });

  it('ignores hidden layers', () => {
    const doc = addElement(createDocument(), table('t', 1000, 1000));
    expect(elementAt(doc, { x: 1000, y: 1000 }, new Set(['furniture']))).toBeUndefined();
  });
});

describe('marquee selection', () => {
  it('selects by bounds, so a clipped corner still counts', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a', 1000, 1000));
    doc = addElement(doc, table('b', 20000, 20000));

    const selected = elementsInMarquee(doc, { x: 0, y: 0, width: 2000, height: 2000 });
    expect(selected).toEqual(['a']);
  });

  it('selects everything under a large marquee', () => {
    let doc = createDocument();
    for (let i = 0; i < 10; i++) doc = addElement(doc, table(`t${String(i)}`, i * 2000, 0));

    const selected = elementsInMarquee(doc, { x: -5000, y: -5000, width: 50000, height: 50000 });
    expect(selected).toHaveLength(10);
  });
});

describe('seatPositions', () => {
  it('generates one position per seat', () => {
    expect(seatPositions({ x: 0, y: 0 }, inches(60), 8)).toHaveLength(8);
    expect(seatPositions({ x: 0, y: 0 }, inches(72), 10)).toHaveLength(10);
  });

  it('places seats just outside the table edge', () => {
    const [first] = seatPositions({ x: 0, y: 0 }, inches(60), 8);
    expect(first).toBeDefined();
    if (!first) return;

    const expected = inches(60) / 2 + SEAT_OFFSET_MM;
    expect(distance({ x: 0, y: 0 }, first)).toBeCloseTo(expected, 0);
  });

  it('starts at the top of the table', () => {
    const [first] = seatPositions({ x: 0, y: 0 }, inches(60), 4);
    expect(first?.x).toBe(0);
    expect(first?.y).toBeLessThan(0);
  });

  it('spaces seats evenly around the circle', () => {
    const seats = seatPositions({ x: 0, y: 0 }, inches(60), 4);
    const gaps = seats.map((s, i) => distance(s, seats[(i + 1) % seats.length] ?? s));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, 0);
  });

  it('follows the table rotation', () => {
    const unrotated = seatPositions({ x: 0, y: 0 }, inches(60), 4, 0);
    const rotated = seatPositions({ x: 0, y: 0 }, inches(60), 4, 90);
    expect(rotated[0]).toEqual(unrotated[1]);
  });

  it('returns nothing for a table with no seats', () => {
    expect(seatPositions({ x: 0, y: 0 }, inches(60), 0)).toEqual([]);
    expect(seatPositions({ x: 0, y: 0 }, inches(60), -3)).toEqual([]);
  });
});
