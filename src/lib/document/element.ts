/**
 * The element model.
 *
 * Elements are plain, serializable objects. No classes, no framework types, no
 * renderer state — the in-memory shape *is* the file shape, so serialization is
 * nearly free and the PDF exporter reads exactly what the screen renderer reads.
 *
 * All geometry is integer millimetres (ADR-0006). Mutations return new objects
 * (ADR-0003); nothing here modifies its input.
 */

import type { Point } from '$lib/geometry/vec';
import type { Rect } from '$lib/geometry/transform';
import { boundsOf, boundsOfRotatedRect } from '$lib/geometry/transform';

/** Stable identifier. Opaque — never parse meaning out of it. */
export type ElementId = string;

/** Layer names are free-form; these three always exist in a new document. */
export const DEFAULT_LAYERS = ['room', 'furniture', 'annotations'] as const;

interface ElementBase {
  readonly id: ElementId;
  readonly layer: string;
  /** Degrees clockwise on screen. Rooms ignore it. */
  readonly rotationDeg: number;
  /** Locked elements are visible and selectable but cannot be moved or edited. */
  readonly locked: boolean;
  /** User-visible name, e.g. "T12" or "Head table". */
  readonly label: string;
}

/** The room outline. A document may hold several — a foyer plus a ballroom. */
export interface RoomElement extends ElementBase {
  readonly type: 'room';
  readonly points: readonly Point[];
}

export interface RoundTableElement extends ElementBase {
  readonly type: 'roundTable';
  readonly center: Point;
  readonly diameterMm: number;
  readonly seats: number;
}

export interface RectTableElement extends ElementBase {
  readonly type: 'rectTable';
  /** Top-left corner before rotation. */
  readonly origin: Point;
  readonly widthMm: number;
  readonly depthMm: number;
  readonly seats: number;
}

/** Non-seating furniture: stage, dancefloor, bar, buffet, DJ booth. */
export type FixtureKind = 'stage' | 'dancefloor' | 'bar' | 'buffet' | 'av' | 'column' | 'other';

export interface FixtureElement extends ElementBase {
  readonly type: 'fixture';
  readonly kind: FixtureKind;
  readonly origin: Point;
  readonly widthMm: number;
  readonly depthMm: number;
}

/** A free-standing text note on the plan. */
export interface NoteElement extends ElementBase {
  readonly type: 'note';
  readonly origin: Point;
  readonly text: string;
}

export type FloorElement =
  RoomElement | RoundTableElement | RectTableElement | FixtureElement | NoteElement;

export type ElementType = FloorElement['type'];

/** How many seats an element contributes. Non-seating elements contribute none. */
export function seatCount(element: FloorElement): number {
  switch (element.type) {
    case 'roundTable':
    case 'rectTable':
      return element.seats;
    default:
      return 0;
  }
}

/**
 * Axis-aligned bounds of an element, accounting for rotation.
 *
 * This is what the spatial index stores and what hit-testing narrows against,
 * so it must never under-report — a box too small makes elements unclickable.
 */
export function elementBounds(element: FloorElement): Rect {
  switch (element.type) {
    case 'room':
      return boundsOf(element.points);

    case 'roundTable': {
      const r = element.diameterMm / 2;
      // A circle's bounds are rotation-invariant, so no rotation is applied.
      return {
        x: element.center.x - r,
        y: element.center.y - r,
        width: element.diameterMm,
        height: element.diameterMm,
      };
    }

    case 'rectTable':
      return boundsOfRotatedRect(
        {
          x: element.origin.x,
          y: element.origin.y,
          width: element.widthMm,
          height: element.depthMm,
        },
        element.rotationDeg
      );

    case 'fixture':
      return boundsOfRotatedRect(
        {
          x: element.origin.x,
          y: element.origin.y,
          width: element.widthMm,
          height: element.depthMm,
        },
        element.rotationDeg
      );

    case 'note':
      // A note has no intrinsic size until it is laid out with a font. Zero
      // width is honest here; the renderer supplies a hit area of its own.
      return { x: element.origin.x, y: element.origin.y, width: 0, height: 0 };
  }
}

/** The element's anchor point — what rotation pivots around and moves track. */
export function elementPosition(element: FloorElement): Point {
  switch (element.type) {
    case 'roundTable':
      return element.center;
    case 'rectTable':
    case 'fixture':
    case 'note':
      return element.origin;
    case 'room': {
      const b = boundsOf(element.points);
      return { x: b.x, y: b.y };
    }
  }
}

/**
 * Translate an element by a millimetre offset.
 *
 * Returns a new element; the original is untouched. Locked elements are
 * returned unchanged rather than throwing — a multi-select drag containing one
 * locked table should move the rest, not fail.
 */
export function moveElement(element: FloorElement, dx: number, dy: number): FloorElement {
  if (element.locked) return element;
  if (dx === 0 && dy === 0) return element;

  switch (element.type) {
    case 'room':
      return {
        ...element,
        points: element.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
      };
    case 'roundTable':
      return { ...element, center: { x: element.center.x + dx, y: element.center.y + dy } };
    case 'rectTable':
    case 'fixture':
    case 'note':
      return { ...element, origin: { x: element.origin.x + dx, y: element.origin.y + dy } };
  }
}

/**
 * Set an element's rotation to an absolute angle.
 *
 * Absolute rather than relative on purpose: a drag should rotate the original
 * element by the total angle each frame, never accumulate frame by frame, or
 * the rounding drift documented in ADR-0006 walks the element across the floor.
 */
export function rotateElement(element: FloorElement, degrees: number): FloorElement {
  if (element.locked || element.type === 'room') return element;
  return { ...element, rotationDeg: ((degrees % 360) + 360) % 360 };
}

/** Apply arbitrary property overrides, preserving the discriminant. */
export function updateElement<T extends FloorElement>(
  element: T,
  changes: Partial<Omit<T, 'id' | 'type'>>
): T {
  return { ...element, ...changes };
}
