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

import type { FloorElement, FixtureKind, SignMount } from '$lib/document/element';
import type { Point } from '$lib/geometry/vec';
import { inches, feet } from '$lib/geometry/units';

export type CatalogCategory = 'table' | 'seating' | 'fixture' | 'signage';

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

/* ------------------------------------------------------------------ *
 * Signage
 *
 * Sizes are the printed face, quoted the way a printer quotes them —
 * "24x36" is 24 inches wide by 36 inches tall. Only the width of that face
 * shows up in plan view; the depth below is the footprint the mount occupies
 * on the floor, which is a different number and the one that decides whether
 * a sign fits in an aisle.
 * ------------------------------------------------------------------ */

/** Floor depth each mount occupies, independent of the printed face. */
const MOUNT_FOOTPRINT_DEPTH_MM: Record<SignMount, number> = {
  /** Legs splay to roughly 20" front to back when open. */
  aFrame: inches(20),
  /** A folded card leans on a base a few inches deep. */
  tableTent: inches(7),
  /** Hung flat; the depth is the pole pocket, not the drop. */
  banner: inches(4),
  /** Zip-tied flat to the cart. */
  cartBoard: inches(1),
  /** Flat to the wall. */
  wall: inches(2),
};

function sign(
  id: string,
  name: string,
  mount: SignMount,
  faceWidthInches: number,
  faceHeightInches: number,
  note: string,
  options: { readonly sponsor?: string; readonly doubleSided?: boolean } = {}
): CatalogItem {
  const widthMm = inches(faceWidthInches);
  const depthMm = MOUNT_FOOTPRINT_DEPTH_MM[mount];
  return {
    id,
    name,
    category: 'signage',
    note,
    create: (elementId, at) => ({
      id: elementId,
      type: 'sign',
      layer: 'signage',
      rotationDeg: 0,
      locked: false,
      label: name,
      mount,
      origin: { x: at.x - widthMm / 2, y: at.y - depthMm / 2 },
      widthMm,
      depthMm,
      faceHeightMm: inches(faceHeightInches),
      sponsor: options.sponsor ?? '',
      doubleSided: options.doubleSided ?? false,
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

  // Pavilion features. Same geometry as any other fixture; they exist as their
  // own kinds so a sign plan can distinguish a gift station from a buffet.
  fixture(
    'feature-registration',
    'Event Registration Desk',
    'registration',
    8,
    2.5,
    'Check-in. Site it inside the entry, clear of the door swing.'
  ),
  fixture(
    'feature-gift-station',
    'Gift Station',
    'giftStation',
    8,
    2.5,
    'Guest gift pickup. Queue forms in front of it — leave 6ft.'
  ),
  fixture(
    'feature-photo-booth',
    'Instant-Print Photo Booth',
    'photoBooth',
    8,
    8,
    'Needs power and a backdrop wall. Prints on site.'
  ),
  fixture(
    'feature-tv',
    'Mounted Television',
    'display',
    5,
    0.5,
    'Wall or truss mounted. Depth is the bracket, not the screen.'
  ),
  fixture(
    'feature-raffle-print',
    'Raffle Ticket Printing Table 8ft',
    'kiosk',
    8,
    2.5,
    'On-demand ticket printing. Needs power and network.'
  ),
  fixture(
    'feature-auction-display',
    'Auction & Raffle Display Table',
    'display',
    8,
    2.5,
    'Prize display. Pair with the raffle & auction A-frame.'
  ),
  fixture(
    'feature-lounge-nook',
    'Lounge Nook',
    'lounge',
    8,
    8,
    'Soft seating cluster. Site off the main circulation route.'
  ),

  /* Pavilion signage — BPB26 Signage Plan §2.1. */
  sign(
    'sign-raffle-auction',
    'Raffle & Auction Sign — A-Frame 24x36',
    'aFrame',
    24,
    36,
    'Freestanding two-sided sign on a hinged easel base. Qty 1-2.',
    { sponsor: 'Tasquantum (Briley)', doubleSided: true }
  ),
  sign(
    'sign-dinner-line',
    'Dinner / Food & Refreshment Line Sign — Table Tent 22x28',
    'tableTent',
    22,
    28,
    'Folded card, one per buffet cluster along the catering line. Qty 3-4.',
    { sponsor: 'Deutser (Pit Room)' }
  ),
  sign(
    'sign-wine-bar',
    'Wine / Bar Sign — Table Tent 22x28',
    'tableTent',
    22,
    28,
    'Table tent at the bar structure. Qty 1-2.',
    { sponsor: 'Steel Supply (Caymus)' }
  ),

  /* On-course signage — §3. Not pavilion objects, but they belong to the same plan. */
  sign(
    'sign-course-banner',
    'Course Banner — Sponsor',
    'banner',
    96,
    36,
    'Sponsored course banner. Drawn at 8x3ft; final size held by MarCom.'
  ),
  sign(
    'sign-comfort-station',
    'Comfort Station A-Frame — HFB Inventory',
    'aFrame',
    24,
    36,
    'Existing HFB white A-frame beside each 8ft table. One side printed. Qty 3.',
    { sponsor: 'Mobilease', doubleSided: true }
  ),

  /* Golf cart signage — §4. One recommendation, two fallbacks. */
  sign(
    'sign-cart-board',
    'Golf Cart Board — Coroplast 10x36',
    'cartBoard',
    36,
    10,
    'Recommended. Grommeted, zip-tied to the roof support. Needs GHSC sign-off.'
  ),
  sign(
    'sign-cart-cling-half',
    'Golf Cart Windshield Cling — Half 8x18',
    'cartBoard',
    18,
    8,
    'Fallback. Removable cling; only works if the carts have windshields.'
  ),
  sign(
    'sign-cart-cling-full',
    'Golf Cart Windshield Cling — Full 8x36',
    'cartBoard',
    36,
    8,
    'Fallback. Full-width cling; same windshield caveat.'
  ),
  sign(
    'sign-cart-magnet',
    'Golf Cart Magnetic Panel',
    'cartBoard',
    24,
    12,
    'Fallback. Reusable, but only holds on a flat metal body.'
  ),
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
