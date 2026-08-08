import { describe, it, expect } from 'vitest';
import {
  createDocument,
  addElement,
  insertElement,
  removeElement,
  replaceElement,
  findElement,
  totalSeats,
  documentBounds,
  roomAreaMm2,
  CURRENT_SCHEMA_VERSION,
} from './document';
import { elementBounds, moveElement, rotateElement, seatCount, type FloorElement } from './element';
import { inches, feet } from '$lib/geometry/units';
import { occupantLoad } from '$lib/geometry/clearance';

const roundTable = (id: string, x: number, y: number, seats = 8): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id.toUpperCase(),
  center: { x, y },
  diameterMm: inches(60),
  seats,
});

const room = (id: string, w: number, h: number): FloorElement => ({
  id,
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: false,
  label: 'Ballroom',
  points: [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ],
});

describe('createDocument', () => {
  it('stamps the current schema version', () => {
    expect(createDocument().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('starts empty with the three default layers', () => {
    const doc = createDocument();
    expect(doc.elements).toEqual([]);
    expect(doc.layers).toEqual(['room', 'furniture', 'annotations']);
  });

  it('holds no Date, Map, or class instance — it must survive JSON round-trip', () => {
    const doc = createDocument({ name: 'Spring Gala' });
    expect(JSON.parse(JSON.stringify(doc))).toEqual(doc);
  });
});

describe('element operations are immutable', () => {
  it('does not modify the document when adding', () => {
    const doc = createDocument();
    const next = addElement(doc, roundTable('t1', 1000, 1000));

    expect(doc.elements).toHaveLength(0);
    expect(next.elements).toHaveLength(1);
  });

  it('does not modify the element when moving', () => {
    const table = roundTable('t1', 1000, 1000);
    const moved = moveElement(table, 500, 0);

    expect(table.type === 'roundTable' && table.center).toEqual({ x: 1000, y: 1000 });
    expect(moved.type === 'roundTable' && moved.center).toEqual({ x: 1500, y: 1000 });
  });

  it('refuses to move a locked element but returns it unchanged rather than throwing', () => {
    const locked = { ...roundTable('t1', 1000, 1000), locked: true };
    expect(moveElement(locked, 500, 0)).toBe(locked);
  });

  it('normalizes rotation into [0, 360)', () => {
    const table = roundTable('t1', 0, 0);
    expect(rotateElement(table, 450).rotationDeg).toBe(90);
    expect(rotateElement(table, -90).rotationDeg).toBe(270);
  });

  it('never rotates a room, whose points already carry its orientation', () => {
    const r = room('r1', 1000, 1000);
    expect(rotateElement(r, 45)).toBe(r);
  });
});

describe('draw order', () => {
  it('appends on add', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = addElement(doc, roundTable('b', 0, 0));
    expect(doc.elements.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('inserts at a position', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = addElement(doc, roundTable('c', 0, 0));
    doc = insertElement(doc, roundTable('b', 0, 0), 1);
    expect(doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an out-of-range insert index instead of leaving a hole', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = insertElement(doc, roundTable('z', 0, 0), 99);
    expect(doc.elements.map((e) => e.id)).toEqual(['a', 'z']);
  });

  it('keeps position when replacing', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = addElement(doc, roundTable('b', 0, 0));
    doc = addElement(doc, roundTable('c', 0, 0));
    doc = replaceElement(doc, { ...roundTable('b', 500, 500), label: 'moved' });

    expect(doc.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(findElement(doc, 'b')?.label).toBe('moved');
  });

  it('ignores a replace for an element that is not present', () => {
    const doc = addElement(createDocument(), roundTable('a', 0, 0));
    expect(replaceElement(doc, roundTable('ghost', 0, 0))).toBe(doc);
  });

  it('refuses to add an element whose id is already present', () => {
    // Ids must be unique: removeElement and friends address by id, and a
    // duplicate would make a single delete take both copies with it.
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = addElement(doc, roundTable('a', 9999, 9999));

    expect(doc.elements).toHaveLength(1);
    expect(findElement(doc, 'a')?.type === 'roundTable').toBe(true);
  });

  it('refuses a duplicate id on insert too', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    const before = doc;
    doc = insertElement(doc, roundTable('a', 500, 500), 0);
    expect(doc).toBe(before);
  });

  it('removes by id', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = addElement(doc, roundTable('b', 0, 0));
    doc = removeElement(doc, 'a');
    expect(doc.elements.map((e) => e.id)).toEqual(['b']);
  });
});

describe('elementBounds', () => {
  it('bounds a round table by its diameter, ignoring rotation', () => {
    const table = { ...roundTable('t', 5000, 5000), rotationDeg: 37 };
    const b = elementBounds(table);
    expect(b.width).toBe(inches(60));
    expect(b.height).toBe(inches(60));
    expect(b.x).toBe(5000 - inches(60) / 2);
  });

  it('grows a rectangular table box when it is rotated', () => {
    const table: FloorElement = {
      id: 'r',
      type: 'rectTable',
      layer: 'furniture',
      rotationDeg: 90,
      locked: false,
      label: '',
      origin: { x: 0, y: 0 },
      widthMm: inches(96),
      depthMm: inches(30),
      seats: 8,
    };
    const b = elementBounds(table);
    expect(b.width).toBe(inches(30));
    expect(b.height).toBe(inches(96));
  });
});

describe('seat counting', () => {
  it('counts only seating elements', () => {
    expect(seatCount(roundTable('t', 0, 0, 10))).toBe(10);
    expect(seatCount(room('r', 1000, 1000))).toBe(0);
  });

  it('totals across the plan', () => {
    let doc = createDocument();
    doc = addElement(doc, room('r', feet(60), feet(40)));
    for (let i = 0; i < 12; i++) doc = addElement(doc, roundTable(`t${String(i)}`, i * 3000, 0));
    expect(totalSeats(doc)).toBe(96);
  });
});

describe('documentBounds', () => {
  it('is a zero rect for an empty plan, not Infinity', () => {
    expect(documentBounds(createDocument())).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('covers every element', () => {
    let doc = createDocument();
    doc = addElement(doc, roundTable('a', 0, 0));
    doc = addElement(doc, roundTable('b', 10000, 5000));

    const b = documentBounds(doc);
    const r = inches(60) / 2;
    expect(b.x).toBe(-r);
    expect(b.width).toBe(10000 + inches(60));
  });
});

describe('roomAreaMm2 and occupant load', () => {
  it('counts rooms only, so furniture cannot inflate a life-safety number', () => {
    let doc = createDocument();
    doc = addElement(doc, room('r', feet(60), feet(40)));
    for (let i = 0; i < 12; i++) doc = addElement(doc, roundTable(`t${String(i)}`, i * 3000, 0));

    // 60 x 40 ft = 2400 sq ft, regardless of how many tables sit in it.
    expect(occupantLoad(roomAreaMm2(doc))).toBe(160);
  });

  it('sums multiple rooms', () => {
    let doc = createDocument();
    doc = addElement(doc, room('a', feet(60), feet(40)));
    doc = addElement(doc, { ...room('b', feet(30), feet(20)), id: 'b' });
    expect(occupantLoad(roomAreaMm2(doc))).toBe(200); // 2400 + 600 = 3000 sq ft
  });

  it('is zero with no rooms drawn', () => {
    const doc = addElement(createDocument(), roundTable('t', 0, 0));
    expect(roomAreaMm2(doc)).toBe(0);
  });
});
