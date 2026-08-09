/**
 * The document.
 *
 * One plan: its metadata, its layers, and its elements in draw order. Plain and
 * serializable — `JSON.stringify` of this object is the `.floored` file
 * (ADR-0004), which is why nothing here holds a class, a Map, or a Date.
 *
 * Every operation is pure and returns a new document.
 */

import type { FloorElement, ElementId } from './element';
import { DEFAULT_LAYERS, seatCount, elementBounds } from './element';
import type { Rect } from '$lib/geometry/transform';
import { boundsOf } from '$lib/geometry/transform';
import { area } from '$lib/geometry/polygon';

/**
 * File format version.
 *
 * A single incrementing integer, not semver. ADR-0004 promises one migration
 * function per bump, and semver invites arguing about whether a change is minor
 * — an integer has no such ambiguity.
 *
 * History:
 *   1 — first release: room, roundTable, rectTable, fixture, note
 *   2 — adds seatingBlock (Phase 5)
 */
export const CURRENT_SCHEMA_VERSION = 2;

export interface DocumentMeta {
  /** Event name, shown in the PDF title block. */
  readonly name: string;
  /** ISO 8601 date string, or empty. Stored as text so the document has no Date. */
  readonly eventDate: string;
  readonly notes: string;
  /** Preferred display units. Never affects stored geometry. */
  readonly unitSystem: 'imperial' | 'metric';
}

export interface FlooredDocument {
  readonly schemaVersion: number;
  readonly meta: DocumentMeta;
  readonly layers: readonly string[];
  /** Draw order: earlier elements render beneath later ones. */
  readonly elements: readonly FloorElement[];
}

export function createDocument(meta: Partial<DocumentMeta> = {}): FlooredDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      name: 'Untitled plan',
      eventDate: '',
      notes: '',
      unitSystem: 'imperial',
      ...meta,
    },
    layers: [...DEFAULT_LAYERS],
    elements: [],
  };
}

export function findElement(doc: FlooredDocument, id: ElementId): FloorElement | undefined {
  return doc.elements.find((e) => e.id === id);
}

export function indexOfElement(doc: FlooredDocument, id: ElementId): number {
  return doc.elements.findIndex((e) => e.id === id);
}

/**
 * Append an element on top of the draw order.
 *
 * Ignored when the id is already present. Element ids must be unique — several
 * operations, `removeElement` among them, address elements by id and would
 * otherwise act on all the duplicates at once.
 */
export function addElement(doc: FlooredDocument, element: FloorElement): FlooredDocument {
  if (indexOfElement(doc, element.id) !== -1) return doc;
  return { ...doc, elements: [...doc.elements, element] };
}

/**
 * Insert an element at a specific position in the draw order.
 *
 * Used by undo: removing an element and re-adding it must restore its original
 * stacking, or undoing a delete silently brings the table back on top of
 * everything it used to sit beneath.
 */
export function insertElement(
  doc: FlooredDocument,
  element: FloorElement,
  index: number
): FlooredDocument {
  if (indexOfElement(doc, element.id) !== -1) return doc;
  const clamped = Math.max(0, Math.min(index, doc.elements.length));
  const next = [...doc.elements];
  next.splice(clamped, 0, element);
  return { ...doc, elements: next };
}

export function removeElement(doc: FlooredDocument, id: ElementId): FlooredDocument {
  return { ...doc, elements: doc.elements.filter((e) => e.id !== id) };
}

/** Replace an element in place, preserving its position in the draw order. */
export function replaceElement(doc: FlooredDocument, element: FloorElement): FlooredDocument {
  const index = indexOfElement(doc, element.id);
  if (index === -1) return doc;
  const next = [...doc.elements];
  next[index] = element;
  return { ...doc, elements: next };
}

export function updateMeta(doc: FlooredDocument, changes: Partial<DocumentMeta>): FlooredDocument {
  return { ...doc, meta: { ...doc.meta, ...changes } };
}

/** Total seats across every table in the plan. */
export function totalSeats(doc: FlooredDocument): number {
  return doc.elements.reduce((sum, e) => sum + seatCount(e), 0);
}

/** Bounds of everything in the plan, or a zero rect for an empty document. */
export function documentBounds(doc: FlooredDocument): Rect {
  if (doc.elements.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const corners = doc.elements.flatMap((element) => {
    const b = elementBounds(element);
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
    ];
  });

  return boundsOf(corners);
}

/**
 * Combined floor area of every room in the document, in square millimetres.
 *
 * This feeds the occupant-load estimate, so it counts rooms only — furniture
 * does not add floor area, and counting a dancefloor twice would inflate a
 * life-safety number.
 */
export function roomAreaMm2(doc: FlooredDocument): number {
  return doc.elements
    .filter((e): e is Extract<FloorElement, { type: 'room' }> => e.type === 'room')
    .reduce((sum, room) => sum + area(room.points), 0);
}
