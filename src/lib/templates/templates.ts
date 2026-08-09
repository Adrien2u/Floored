/**
 * Starting plans.
 *
 * The third-ranked complaint in the research is that these tools are overkill
 * for small events — users said copy-paste in another program was faster than
 * setting one up. A template answers that directly: the app should hand back a
 * usable plan before the user has decided what to click.
 *
 * Every template lays out from the same sourced constants the catalog uses
 * (docs/RESEARCH.md §3), so a generated plan passes the app's own clearance
 * checks rather than shipping a warning on first open. Nothing here is magic —
 * a template is a document like any other, and the user's first edit makes it
 * theirs.
 */

import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement, FixtureKind } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';
import { CLEARANCE } from '$lib/geometry/clearance';

export interface TemplateOptions {
  /** Room width in millimetres. */
  readonly roomWidthMm: number;
  /** Room depth in millimetres. */
  readonly roomDepthMm: number;
  readonly name: string;
  readonly unitSystem: 'imperial' | 'metric';
}

export interface Template {
  readonly id: string;
  readonly name: string;
  /** One line, shown on the card. What the plan is for, not how it is built. */
  readonly summary: string;
  /** The room this template is designed around, and its default name. */
  readonly defaults: TemplateOptions;
  create(options?: Partial<TemplateOptions>): FlooredDocument;
}

/* ------------------------------------------------------------------ *
 * Building blocks
 * ------------------------------------------------------------------ */

const ROUND_60 = inches(60);
const ROUND_72 = inches(72);
const BANQUET_LENGTH = inches(96);
const BANQUET_DEPTH = inches(30);
const CHAIR_PITCH = inches(22);
const ROW_PITCH = inches(36);

/** Wall clearance. Nothing is placed hard against a wall in a real room. */
const PERIMETER = feet(3);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function room(widthMm: number, depthMm: number, label: string): FloorElement {
  return {
    id: 'room',
    type: 'room',
    layer: 'room',
    rotationDeg: 0,
    // Locked, so the first drag moves furniture rather than the building.
    locked: true,
    label,
    points: [
      { x: 0, y: 0 },
      { x: widthMm, y: 0 },
      { x: widthMm, y: depthMm },
      { x: 0, y: depthMm },
    ],
  };
}

function fixture(
  id: string,
  label: string,
  kind: FixtureKind,
  x: number,
  y: number,
  widthMm: number,
  depthMm: number
): FloorElement {
  return {
    id,
    type: 'fixture',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label,
    kind,
    origin: { x: Math.round(x), y: Math.round(y) },
    widthMm,
    depthMm,
  };
}

function roundTable(
  id: string,
  cx: number,
  cy: number,
  diameterMm: number,
  seats: number
): FloorElement {
  return {
    id,
    type: 'roundTable',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label: '',
    center: { x: Math.round(cx), y: Math.round(cy) },
    diameterMm,
    seats,
  };
}

function rectTable(
  id: string,
  x: number,
  y: number,
  widthMm: number,
  depthMm: number,
  seats: number,
  label = ''
): FloorElement {
  return {
    id,
    type: 'rectTable',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label,
    origin: { x: Math.round(x), y: Math.round(y) },
    widthMm,
    depthMm,
    seats,
  };
}

function seatingBlock(
  id: string,
  label: string,
  x: number,
  y: number,
  rows: number,
  columns: number
): FloorElement {
  return {
    id,
    type: 'seatingBlock',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label,
    origin: { x: Math.round(x), y: Math.round(y) },
    rows,
    columns,
    seatPitchMm: CHAIR_PITCH,
    rowPitchMm: ROW_PITCH,
  };
}

/**
 * Fill a rectangle with round tables on a grid.
 *
 * Pitch is the table diameter plus the comfortable 60″ gap, so a generated plan
 * clears the app's own check rather than opening with a warning against itself.
 * Tables are centred in the region, because a layout pushed into one corner
 * reads as a bug even when the spacing is right.
 */
function roundGrid(
  region: { x: number; y: number; width: number; depth: number },
  diameterMm: number,
  seats: number,
  idPrefix = 't'
): FloorElement[] {
  const pitch = diameterMm + CLEARANCE.betweenTablesComfortable;

  const columns = Math.floor((region.width + CLEARANCE.betweenTablesComfortable) / pitch);
  const rows = Math.floor((region.depth + CLEARANCE.betweenTablesComfortable) / pitch);
  if (columns < 1 || rows < 1) return [];

  const usedWidth = columns * pitch - CLEARANCE.betweenTablesComfortable;
  const usedDepth = rows * pitch - CLEARANCE.betweenTablesComfortable;
  const left = region.x + (region.width - usedWidth) / 2;
  const top = region.y + (region.depth - usedDepth) / 2;

  const tables: FloorElement[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      tables.push(
        roundTable(
          `${idPrefix}${String(row * columns + column + 1)}`,
          left + column * pitch + diameterMm / 2,
          top + row * pitch + diameterMm / 2,
          diameterMm,
          seats
        )
      );
    }
  }
  return tables;
}

function build(
  options: TemplateOptions,
  elements: (o: TemplateOptions) => FloorElement[]
): FlooredDocument {
  let doc = createDocument({ name: options.name, unitSystem: options.unitSystem });
  doc = addElement(doc, room(options.roomWidthMm, options.roomDepthMm, 'Room'));
  for (const element of elements(options)) doc = addElement(doc, element);
  return doc;
}

function template(
  id: string,
  name: string,
  summary: string,
  defaults: TemplateOptions,
  elements: (o: TemplateOptions) => FloorElement[]
): Template {
  return {
    id,
    name,
    summary,
    defaults,
    create: (overrides = {}) => build({ ...defaults, ...overrides }, elements),
  };
}

const imperial = (name: string, widthFeet: number, depthFeet: number): TemplateOptions => ({
  name,
  roomWidthMm: feet(widthFeet),
  roomDepthMm: feet(depthFeet),
  unitSystem: 'imperial',
});

/* ------------------------------------------------------------------ *
 * The templates
 * ------------------------------------------------------------------ */

export const TEMPLATES: readonly Template[] = [
  template(
    'wedding',
    'Wedding reception',
    'Head table, dancefloor, rounds of eight, bar and cake table.',
    imperial('Wedding reception', 60, 40),
    (o) => {
      // The dancefloor is sized to the room rather than fixed: an 18ft floor
      // in a 40ft room leaves no band wide enough for a table, which is how
      // the first draft of this template produced a plan seating eight.
      const dancefloorSide = clamp(Math.min(o.roomWidthMm, o.roomDepthMm) / 3, feet(12), feet(20));

      const headWidth = Math.min(BANQUET_LENGTH * 2, o.roomWidthMm - PERIMETER * 2);
      // The walkway around the dancefloor is an aisle, not a service run: the
      // 60″ figure is for staff carrying trays between tables, and spending it
      // on all four sides of the floor costs a whole row of guests.
      const floorAisle = CLEARANCE.adaAisleMin;
      const bandTop = PERIMETER + BANQUET_DEPTH + floorAisle;
      const dancefloorX = o.roomWidthMm / 2 - dancefloorSide / 2;

      const elements: FloorElement[] = [
        rectTable(
          'head',
          o.roomWidthMm / 2 - headWidth / 2,
          PERIMETER,
          headWidth,
          BANQUET_DEPTH,
          8,
          'Head table'
        ),
        fixture(
          'dancefloor',
          'Dancefloor',
          'dancefloor',
          dancefloorX,
          bandTop,
          dancefloorSide,
          dancefloorSide
        ),
      ];

      // Guest tables go where they actually go: down both sides of the
      // dancefloor, then across the back of the room.
      const sideWidth = dancefloorX - PERIMETER - floorAisle;
      elements.push(
        ...roundGrid(
          { x: PERIMETER, y: bandTop, width: sideWidth, depth: dancefloorSide },
          ROUND_60,
          8,
          'l'
        ),
        ...roundGrid(
          {
            x: dancefloorX + dancefloorSide + floorAisle,
            y: bandTop,
            width: sideWidth,
            depth: dancefloorSide,
          },
          ROUND_60,
          8,
          'r'
        ),
        ...roundGrid(
          {
            x: PERIMETER,
            y: bandTop + dancefloorSide + floorAisle,
            width: o.roomWidthMm - PERIMETER * 2,
            depth: o.roomDepthMm - (bandTop + dancefloorSide + floorAisle) - PERIMETER,
          },
          ROUND_60,
          8,
          'b'
        )
      );

      // The bar and the cake table go last, along the back wall, in whatever
      // strip the tables left.
      elements.push(
        fixture(
          'bar',
          'Bar',
          'bar',
          PERIMETER,
          o.roomDepthMm - PERIMETER - feet(2.5),
          Math.min(feet(8), o.roomWidthMm - PERIMETER * 2),
          feet(2.5)
        ),
        rectTable(
          'cake',
          o.roomWidthMm - PERIMETER - feet(4),
          o.roomDepthMm - PERIMETER - feet(2.5),
          feet(4),
          feet(2.5),
          0,
          'Cake'
        )
      );

      return elements;
    }
  ),

  template(
    'gala',
    'Gala dinner',
    'Stage, rounds of ten across the floor, bars either side.',
    imperial('Gala dinner', 80, 60),
    (o) => {
      const stageWidth = feet(24);
      const stageDepth = feet(6);
      const tablesTop = PERIMETER + stageDepth + CLEARANCE.serviceAisle;

      return [
        fixture(
          'stage',
          'Stage',
          'stage',
          o.roomWidthMm / 2 - stageWidth / 2,
          PERIMETER,
          stageWidth,
          stageDepth
        ),
        fixture(
          'bar-left',
          'Bar',
          'bar',
          PERIMETER,
          o.roomDepthMm - PERIMETER - feet(2.5),
          feet(8),
          feet(2.5)
        ),
        fixture(
          'bar-right',
          'Bar',
          'bar',
          o.roomWidthMm - PERIMETER - feet(8),
          o.roomDepthMm - PERIMETER - feet(2.5),
          feet(8),
          feet(2.5)
        ),
        ...roundGrid(
          {
            x: PERIMETER,
            y: tablesTop,
            width: o.roomWidthMm - PERIMETER * 2,
            depth: o.roomDepthMm - tablesTop - PERIMETER - feet(5),
          },
          ROUND_72,
          10
        ),
      ];
    }
  ),

  template(
    'corporate',
    'Corporate lunch',
    'Presentation screen, banquet rounds, buffet line along one wall.',
    imperial('Corporate lunch', 50, 36),
    (o) => {
      const screenWidth = feet(12);
      const tablesTop = PERIMETER + feet(2) + CLEARANCE.serviceAisle;

      return [
        fixture(
          'screen',
          'Screen',
          'av',
          o.roomWidthMm / 2 - screenWidth / 2,
          PERIMETER,
          screenWidth,
          feet(2)
        ),
        fixture(
          'buffet',
          'Buffet',
          'buffet',
          PERIMETER,
          o.roomDepthMm - PERIMETER - feet(2.5),
          feet(16),
          feet(2.5)
        ),
        ...roundGrid(
          {
            x: PERIMETER,
            y: tablesTop,
            width: o.roomWidthMm - PERIMETER * 2,
            depth: o.roomDepthMm - tablesTop - PERIMETER - feet(5),
          },
          ROUND_60,
          8
        ),
      ];
    }
  ),

  template(
    'theatre',
    'Theatre seating',
    'Stage and two banks of rows with a centre aisle.',
    imperial('Theatre seating', 50, 40),
    (o) => {
      const stageWidth = feet(20);
      const stageDepth = feet(5);
      const rowsTop = PERIMETER + stageDepth + CLEARANCE.serviceAisle;

      const available = o.roomWidthMm - PERIMETER * 2 - CLEARANCE.serviceAisle;
      const columns = Math.max(1, Math.floor(available / 2 / CHAIR_PITCH));
      const rows = Math.max(1, Math.floor((o.roomDepthMm - rowsTop - PERIMETER) / ROW_PITCH));
      const bankWidth = columns * CHAIR_PITCH;

      return [
        fixture(
          'stage',
          'Stage',
          'stage',
          o.roomWidthMm / 2 - stageWidth / 2,
          PERIMETER,
          stageWidth,
          stageDepth
        ),
        // A centre aisle, at the service width rather than the ADA minimum —
        // this is the route everyone leaves by at the same moment.
        seatingBlock('bank-left', 'Left', PERIMETER, rowsTop, rows, columns),
        seatingBlock(
          'bank-right',
          'Right',
          PERIMETER + bankWidth + CLEARANCE.serviceAisle,
          rowsTop,
          rows,
          columns
        ),
      ];
    }
  ),

  template(
    'classroom',
    'Classroom',
    'Rows of trestle tables facing a screen, three to a row.',
    imperial('Classroom', 40, 32),
    (o) => {
      const elements: FloorElement[] = [
        fixture(
          'screen',
          'Screen',
          'av',
          o.roomWidthMm / 2 - feet(6),
          PERIMETER,
          feet(12),
          feet(2)
        ),
      ];

      const top = PERIMETER + feet(2) + CLEARANCE.serviceAisle;
      const columns = 3;
      const gap = feet(2);
      // Rows of desks need a walking aisle, not a service run — nobody is
      // carrying plates between them, and the 60″ figure costs a whole row.
      const rowPitch = BANQUET_DEPTH + CLEARANCE.adaAisleMin;
      const rows = Math.max(1, Math.floor((o.roomDepthMm - top - PERIMETER) / rowPitch));

      const bankWidth = columns * BANQUET_LENGTH + (columns - 1) * gap;
      const left = (o.roomWidthMm - bankWidth) / 2;

      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          elements.push(
            rectTable(
              `d${String(row * columns + column + 1)}`,
              left + column * (BANQUET_LENGTH + gap),
              top + row * rowPitch,
              BANQUET_LENGTH,
              BANQUET_DEPTH,
              // Classroom style seats one side only, so everyone faces forward.
              3
            )
          );
        }
      }
      return elements;
    }
  ),

  template(
    'u-shape',
    'U-shape',
    'Boardroom U facing a screen. Seats on the outside only.',
    imperial('U-shape meeting', 36, 28),
    (o) => {
      const top = PERIMETER + feet(2) + feet(6);
      const bottom = o.roomDepthMm - PERIMETER;
      const legDepth = bottom - top;
      const width = Math.min(feet(20), o.roomWidthMm - PERIMETER * 2);
      const left = (o.roomWidthMm - width) / 2;

      const perLeg = Math.max(1, Math.floor(legDepth / BANQUET_LENGTH));
      const elements: FloorElement[] = [
        fixture(
          'screen',
          'Screen',
          'av',
          o.roomWidthMm / 2 - feet(5),
          PERIMETER,
          feet(10),
          feet(2)
        ),
        // The head of the U, across the top.
        rectTable('u-head', left, top, width, BANQUET_DEPTH, Math.round(width / CHAIR_PITCH / 2)),
      ];

      // The legs run down each side. Each is a column of 8ft tables rotated
      // ninety degrees, which is how they are actually set: the same trestles,
      // turned.
      for (let i = 0; i < perLeg; i++) {
        const y = top + BANQUET_DEPTH + i * BANQUET_LENGTH;
        if (y + BANQUET_LENGTH > bottom) break;

        elements.push(
          {
            ...rectTable(`u-left-${String(i + 1)}`, left, y, BANQUET_DEPTH, BANQUET_LENGTH, 3),
          },
          {
            ...rectTable(
              `u-right-${String(i + 1)}`,
              left + width - BANQUET_DEPTH,
              y,
              BANQUET_DEPTH,
              BANQUET_LENGTH,
              3
            ),
          }
        );
      }
      return elements;
    }
  ),

  template(
    'cabaret',
    'Cabaret',
    'Rounds seated on three sides so nobody has their back to the stage.',
    imperial('Cabaret', 60, 44),
    (o) => {
      const stageWidth = feet(20);
      const stageDepth = feet(6);
      const tablesTop = PERIMETER + stageDepth + CLEARANCE.serviceAisle;

      return [
        fixture(
          'stage',
          'Stage',
          'stage',
          o.roomWidthMm / 2 - stageWidth / 2,
          PERIMETER,
          stageWidth,
          stageDepth
        ),
        // Six seats on a 60″ round rather than eight: cabaret leaves the side
        // facing the stage empty, which is the whole point of the style.
        ...roundGrid(
          {
            x: PERIMETER,
            y: tablesTop,
            width: o.roomWidthMm - PERIMETER * 2,
            depth: o.roomDepthMm - tablesTop - PERIMETER,
          },
          ROUND_60,
          6
        ),
      ];
    }
  ),
];

export function findTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
