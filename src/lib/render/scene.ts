/**
 * Scene queries — culling and hit-testing.
 *
 * Both are linear scans over the element list. That is a deliberate choice, not
 * an oversight: [ADR-0012](../../../docs/adr/ADR-0012-seat-generation.md)
 * established that realistic plans hold under ~1,000 elements, and a thousand
 * bounding-box comparisons is negligible beside painting several thousand
 * shapes.
 *
 * ADR-0001 originally named `rbush` for this. The dependency was not taken,
 * because the ladder in ADR-0010 asks whether a thing needs to exist before
 * asking which library provides it — and at this scale it does not. The
 * benchmark exists to catch the day that changes.
 */

import type { FloorElement, ElementId } from '$lib/document/element';
import { elementBounds, seatingBlockSize } from '$lib/document/element';
import type { FlooredDocument } from '$lib/document/document';
import type { Rect } from '$lib/geometry/transform';
import { rectsOverlap, rotatePoint, rectCenter } from '$lib/geometry/transform';
import type { Point } from '$lib/geometry/vec';
import { distance } from '$lib/geometry/vec';
import { pointInPolygon } from '$lib/geometry/polygon';

/**
 * Elements intersecting a region, in draw order.
 *
 * The region is usually the viewport, grown slightly so an element partly
 * off-screen still draws its visible edge.
 */
export function elementsInBounds(
  doc: FlooredDocument,
  region: Rect,
  hiddenLayers: ReadonlySet<string> = new Set()
): FloorElement[] {
  const found: FloorElement[] = [];
  for (const element of doc.elements) {
    if (hiddenLayers.has(element.layer)) continue;
    if (rectsOverlap(elementBounds(element), region)) found.push(element);
  }
  return found;
}

/** Grow a rectangle on every side. */
export function padRect(rect: Rect, paddingMm: number): Rect {
  return {
    x: rect.x - paddingMm,
    y: rect.y - paddingMm,
    width: rect.width + paddingMm * 2,
    height: rect.height + paddingMm * 2,
  };
}

/**
 * Precise containment test for a single element.
 *
 * Bounds are only a first pass: a round table's bounding box includes four
 * corners that are not the table, and clicking one of them should not select it.
 */
export function hitsElement(element: FloorElement, point: Point): boolean {
  if (!containsPoint(elementBounds(element), point)) return false;

  switch (element.type) {
    case 'roundTable': {
      const r = element.diameterMm / 2;
      return distance(element.center, point) <= r;
    }

    case 'room':
      return pointInPolygon(point, element.points);

    case 'seatingBlock':
    case 'rectTable':
    case 'fixture': {
      const size =
        element.type === 'seatingBlock'
          ? seatingBlockSize(element)
          : { widthMm: element.widthMm, depthMm: element.depthMm };

      const rect = {
        x: element.origin.x,
        y: element.origin.y,
        width: size.widthMm,
        height: size.depthMm,
      };
      if (element.rotationDeg === 0) return containsPoint(rect, point);
      // Rotate the query point backwards instead of the rectangle forwards:
      // one point transformed beats four corners plus an edge test.
      const local = rotatePoint(point, rectCenter(rect), -element.rotationDeg);
      return containsPoint(rect, local);
    }

    case 'note':
      // A note has no geometry of its own until laid out with a font. The
      // renderer supplies a hit area; treat the anchor as a small target.
      return distance(element.origin, point) <= NOTE_HIT_RADIUS_MM;
  }
}

/** Notes get a fixed-size target because their real extent depends on the font. */
export const NOTE_HIT_RADIUS_MM = 150;

function containsPoint(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

/**
 * The element at a point, or `undefined`.
 *
 * Searches in reverse draw order, so the element visually on top is the one
 * selected — which is what the user is pointing at.
 *
 * Rooms are considered last. A room's polygon covers everything inside it, so a
 * naive topmost-first search over a plan whose room sits above the furniture
 * would select the room on every click.
 */
export function elementAt(
  doc: FlooredDocument,
  point: Point,
  hiddenLayers: ReadonlySet<string> = new Set()
): FloorElement | undefined {
  let room: FloorElement | undefined;

  for (let i = doc.elements.length - 1; i >= 0; i--) {
    const element = doc.elements[i];
    if (!element) continue;
    if (hiddenLayers.has(element.layer)) continue;
    if (!hitsElement(element, point)) continue;

    if (element.type === 'room') {
      room ??= element;
      continue;
    }
    return element;
  }

  return room;
}

/**
 * Every element intersecting a marquee rectangle.
 *
 * Uses bounds rather than exact geometry: a drag-select that misses a table
 * whose corner is inside the marquee feels broken, whereas one that includes it
 * matches what the user drew a box around.
 */
export function elementsInMarquee(
  doc: FlooredDocument,
  marquee: Rect,
  hiddenLayers: ReadonlySet<string> = new Set()
): ElementId[] {
  const ids: ElementId[] = [];
  for (const element of doc.elements) {
    if (hiddenLayers.has(element.layer)) continue;
    if (rectsOverlap(elementBounds(element), marquee)) ids.push(element.id);
  }
  return ids;
}

/**
 * Seat positions around a round table, clockwise from the top.
 *
 * Seats are generated, never stored (ADR-0012). A seat's identity is its index
 * here paired with the table's id, which is what guest assignment references.
 */
export function seatPositions(
  center: Point,
  diameterMm: number,
  seats: number,
  rotationDeg = 0
): Point[] {
  if (seats <= 0) return [];

  const radius = diameterMm / 2 + SEAT_OFFSET_MM;
  const positions: Point[] = [];
  const startRad = (rotationDeg * Math.PI) / 180 - Math.PI / 2;

  for (let i = 0; i < seats; i++) {
    const angle = startRad + (i / seats) * Math.PI * 2;
    positions.push({
      x: Math.round(center.x + Math.cos(angle) * radius),
      y: Math.round(center.y + Math.sin(angle) * radius),
    });
  }

  return positions;
}

/** Distance from the table edge to a chair's centre. */
export const SEAT_OFFSET_MM = 320;
