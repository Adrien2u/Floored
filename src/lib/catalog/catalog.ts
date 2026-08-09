/**
 * The object catalog.
 *
 * Every dimension and seat count here comes from the sourced table in
 * docs/RESEARCH.md §3, not from taste. A planner checks these numbers within a
 * minute of opening the app, and getting them wrong makes the tool useless to
 * the people it is for — while getting them right is the cheapest credibility
 * available to an unknown project.
 *
 * Seats are a property of the table, never separate elements (ADR-0012).
 */

import type { FloorElement, FixtureKind } from '$lib/document/element';
import type { Point } from '$lib/geometry/vec';
import { inches, feet } from '$lib/geometry/units';

export type CatalogCategory = 'table' | 'seating' | 'fixture';

export interface CatalogItem {
  readonly id: string;
  readonly name: string;
  readonly category: CatalogCategory;
  /** Short note shown in the catalog — the fact a planner would want. */
  readonly note: string;
  /** Build a placed element at this document point. */
  create(id: string, at: Point): FloorElement;
}

/* ------------------------------------------------------------------ *
 * Round tables
 *
 * A 60" round seats 8 comfortably, 6 spaciously, and 10 tightly. The
 * catalog offers the comfortable count, because a plan built on the tight
 * count leaves no room for the chairs it also has to draw.
 * ------------------------------------------------------------------ */

function roundTable(
  id: string,
  name: string,
  diameterInches: number,
  seats: number,
  note: string
): CatalogItem {
  return {
    id,
    name,
    category: 'table',
    note,
    create: (elementId, at) => ({
      id: elementId,
      type: 'roundTable',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: '',
      center: at,
      diameterMm: inches(diameterInches),
      seats,
    }),
  };
}

function rectTable(
  id: string,
  name: string,
  widthInches: number,
  depthInches: number,
  seats: number,
  note: string
): CatalogItem {
  return {
    id,
    name,
    category: 'table',
    note,
    create: (elementId, at) => ({
      id: elementId,
      type: 'rectTable',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: '',
      // Placed centred on the pointer, which is where a user expects a dropped
      // object to land.
      origin: {
        x: at.x - inches(widthInches) / 2,
        y: at.y - inches(depthInches) / 2,
      },
      widthMm: inches(widthInches),
      depthMm: inches(depthInches),
      seats,
    }),
  };
}

function fixture(
  id: string,
  name: string,
  kind: FixtureKind,
  widthFeet: number,
  depthFeet: number,
  note: string
): CatalogItem {
  return {
    id,
    name,
    category: 'fixture',
    note,
    create: (elementId, at) => ({
      id: elementId,
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: name,
      kind,
      origin: {
        x: at.x - feet(widthFeet) / 2,
        y: at.y - feet(depthFeet) / 2,
      },
      widthMm: feet(widthFeet),
      depthMm: feet(depthFeet),
    }),
  };
}

function seatingBlock(
  id: string,
  name: string,
  rows: number,
  columns: number,
  note: string
): CatalogItem {
  return {
    id,
    name,
    category: 'seating',
    note,
    create: (elementId, at) => ({
      id: elementId,
      type: 'seatingBlock',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: '',
      origin: at,
      rows,
      columns,
      seatPitchMm: SEAT_PITCH_MM,
      rowPitchMm: ROW_PITCH_MM,
    }),
  };
}

/**
 * Seat-to-seat spacing in a row.
 *
 * A banquet chair is about 18" wide; 22" centres leave the elbow room a seated
 * guest actually needs rather than the width the chair physically occupies.
 */
export const SEAT_PITCH_MM = inches(22);

/**
 * Row-to-row spacing.
 *
 * 36" matches the ADA minimum for an accessible route, which is also roughly
 * what a person needs to pass a seated row.
 */
export const ROW_PITCH_MM = inches(36);

export const CATALOG: readonly CatalogItem[] = [
  roundTable('round-48', 'Round 48″', 48, 6, 'Seats 6. Small rounds for tight rooms.'),
  roundTable('round-60', 'Round 60″', 60, 8, 'Seats 8 comfortably, 10 tight. The default.'),
  roundTable('round-72', 'Round 72″', 72, 10, 'Seats 10, up to 12 tight.'),
  roundTable('cocktail-36', 'Cocktail 36″', 36, 4, 'Standing height. No seated cover.'),

  rectTable('banquet-6', 'Banquet 6ft', 72, 30, 6, 'Seats 6, or 8 with ends.'),
  rectTable('banquet-8', 'Banquet 8ft', 96, 30, 8, 'Seats 8, or 10 with ends.'),
  rectTable('head-table', 'Head table 8ft', 96, 30, 4, 'One side only, facing the room.'),

  seatingBlock('ceremony-block', 'Ceremony block', 6, 8, '48 seats. 22″ centres, 36″ rows.'),
  seatingBlock('theatre-block', 'Theatre block', 10, 12, '120 seats. Splits with an aisle.'),

  fixture('stage-20', 'Stage 20×5ft', 'stage', 20, 5, 'Four 4×8 riser sections.'),
  fixture('dancefloor-16', 'Dancefloor 16ft', 'dancefloor', 16, 16, '256 sq ft. See sizing guide.'),
  fixture('bar-8', 'Bar 8ft', 'bar', 8, 2.5, 'One bartender per 75 guests.'),
  fixture('buffet-8', 'Buffet 8ft', 'buffet', 8, 2.5, 'One line per 100 guests.'),
  fixture('av-booth', 'AV / DJ', 'av', 8, 4, 'Allow cable run to stage.'),
  fixture('column', 'Column', 'column', 2, 2, 'Structural. Mark before laying out.'),
];

export function catalogItem(id: string): CatalogItem | undefined {
  return CATALOG.find((item) => item.id === id);
}

export function catalogByCategory(category: CatalogCategory): readonly CatalogItem[] {
  return CATALOG.filter((item) => item.category === category);
}

/**
 * Dancefloor size for a guest count.
 *
 * Industry planning practice: roughly a third of guests dance at once, and each
 * dancing guest needs about 4.5 sq ft. Returned as the side of a square, since
 * dancefloors are laid from square panels.
 *
 * A guide, not a rule — the answer depends on the event as much as the count.
 */
export function suggestedDancefloorSideMm(guestCount: number): number {
  if (guestCount <= 0) return 0;
  const dancing = guestCount / 3;
  const squareFeet = dancing * 4.5;
  const sideFeet = Math.sqrt(squareFeet);
  // Round up to a whole panel; dancefloors come in 3ft sections.
  return feet(Math.ceil(sideFeet / 3) * 3);
}

/**
 * Bars needed for a guest count.
 *
 * One bartender per 75 guests is the common planning figure, and a single 8ft
 * bar station supports one or two bartenders.
 */
export function suggestedBarCount(guestCount: number): number {
  if (guestCount <= 0) return 0;
  return Math.max(1, Math.ceil(guestCount / 150));
}
