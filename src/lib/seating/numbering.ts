/**
 * Numbering tables by position.
 *
 * Venues put number cards on tables in whatever pattern they like, and staff
 * have to match the screen to the physical room or guests get sent to the wrong
 * table. So a number is derived from where a table *is*, not typed onto it.
 *
 * **Applying a scheme changes labels and nothing else.** Moving guests between
 * tables is a separate, explicit operation (`moveTableGuests`). Conflating the
 * two is what broke the system this idea came from: it tracked position swaps
 * in a side structure, and swapping two tables then swapping them back failed
 * because the side structure recorded the reverse instead of cancelling.
 *
 * The rule that follows, and the reason nothing is cached here: **never keep a
 * shadow mapping alongside the truth.** A scheme is computed from positions on
 * demand and stored nowhere. See ADR-0013.
 */

import type { FlooredDocument } from '$lib/document/document';
import type { ElementId, FloorElement } from '$lib/document/element';
import { elementBounds, seatCount } from '$lib/document/element';

export type NumberingPattern =
  /** Reading order: left to right, top to bottom. */
  | 'leftToRight'
  /** Right to left, top to bottom — common where the head table anchors the right. */
  | 'rightToLeft'
  /** Boustrophedon: left to right, then right to left on the next row. */
  | 'snake'
  /** Snake, starting from the right. */
  | 'reverseSnake'
  /** Down each column, then across — for long narrow rooms. */
  | 'columnMajor';

export interface NumberingOptions {
  readonly pattern: NumberingPattern;
  /** First number. Venues that reserve 1 for the head table often start at 2. */
  readonly startAt: number;
  /** Prefix, e.g. `T` for `T1`. Empty for bare numbers. */
  readonly prefix: string;
  /**
   * How far apart two tables' centres can be vertically and still count as the
   * same row, in millimetres.
   *
   * Rows are inferred rather than declared, because a real plan is never a
   * perfect grid — a banquet room has tables nudged around a dancefloor. The
   * default is a table's own width, which groups a nudged table with its row
   * while keeping genuinely separate rows apart.
   */
  readonly rowToleranceMm: number;
}

export const DEFAULT_NUMBERING: NumberingOptions = {
  pattern: 'leftToRight',
  startAt: 1,
  prefix: 'T',
  rowToleranceMm: 1524,
};

/** A table and where its centre sits, for ordering. */
interface Positioned {
  readonly id: ElementId;
  readonly x: number;
  readonly y: number;
}

/** Tables that take a number: anything with seats. */
function numberableTables(doc: FlooredDocument): Positioned[] {
  return doc.elements
    .filter((e: FloorElement) => seatCount(e) > 0)
    .map((e) => {
      const b = elementBounds(e);
      return { id: e.id, x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
}

/**
 * Group tables into rows by vertical proximity.
 *
 * Sorts by y, then starts a new row whenever the gap to the previous table
 * exceeds the tolerance. Simple and predictable, which matters more here than
 * cleverness: a planner needs to be able to look at the result and see why each
 * table got the number it did.
 */
function intoRows(tables: readonly Positioned[], toleranceMm: number): Positioned[][] {
  if (tables.length === 0) return [];

  const byY = [...tables].sort((a, b) => a.y - b.y);
  const rows: Positioned[][] = [];
  let current: Positioned[] = [];
  let rowY = byY[0]?.y ?? 0;

  for (const table of byY) {
    if (current.length > 0 && Math.abs(table.y - rowY) > toleranceMm) {
      rows.push(current);
      current = [];
      rowY = table.y;
    }
    current.push(table);
  }
  if (current.length > 0) rows.push(current);

  return rows;
}

function intoColumns(tables: readonly Positioned[], toleranceMm: number): Positioned[][] {
  if (tables.length === 0) return [];

  const byX = [...tables].sort((a, b) => a.x - b.x);
  const columns: Positioned[][] = [];
  let current: Positioned[] = [];
  let columnX = byX[0]?.x ?? 0;

  for (const table of byX) {
    if (current.length > 0 && Math.abs(table.x - columnX) > toleranceMm) {
      columns.push(current);
      current = [];
      columnX = table.x;
    }
    current.push(table);
  }
  if (current.length > 0) columns.push(current);

  return columns;
}

/**
 * The order tables should be numbered in, under a pattern.
 *
 * Returns element ids, so the caller can label them or simply read the order.
 */
export function numberingOrder(
  doc: FlooredDocument,
  options: NumberingOptions = DEFAULT_NUMBERING
): ElementId[] {
  const tables = numberableTables(doc);
  if (tables.length === 0) return [];

  if (options.pattern === 'columnMajor') {
    return intoColumns(tables, options.rowToleranceMm)
      .flatMap((column) => [...column].sort((a, b) => a.y - b.y))
      .map((t) => t.id);
  }

  const rows = intoRows(tables, options.rowToleranceMm);

  return rows
    .flatMap((row, index) => {
      const leftToRight = [...row].sort((a, b) => a.x - b.x);
      const rightToLeft = [...leftToRight].reverse();

      switch (options.pattern) {
        case 'leftToRight':
          return leftToRight;
        case 'rightToLeft':
          return rightToLeft;
        case 'snake':
          return index % 2 === 0 ? leftToRight : rightToLeft;
        case 'reverseSnake':
          return index % 2 === 0 ? rightToLeft : leftToRight;
        default:
          // 'columnMajor' returned above, but it remains in the union here, so
          // the switch cannot be proven exhaustive without this.
          return leftToRight;
      }
    })
    .map((t) => t.id);
}

/**
 * The label each table would receive.
 *
 * Computed, never stored — see the module note. Callers turn this into commands
 * when the user applies it, and the labels then live on the elements like any
 * other edited property.
 */
export function numberingLabels(
  doc: FlooredDocument,
  options: NumberingOptions = DEFAULT_NUMBERING
): Map<ElementId, string> {
  const labels = new Map<ElementId, string>();

  numberingOrder(doc, options).forEach((id, index) => {
    labels.set(id, `${options.prefix}${String(options.startAt + index)}`);
  });

  return labels;
}

/** Human-readable name for a pattern, for the UI. */
export function patternName(pattern: NumberingPattern): string {
  switch (pattern) {
    case 'leftToRight':
      return 'Left to right';
    case 'rightToLeft':
      return 'Right to left';
    case 'snake':
      return 'Snake';
    case 'reverseSnake':
      return 'Snake from right';
    case 'columnMajor':
      return 'Down columns';
  }
}

export const NUMBERING_PATTERNS: readonly NumberingPattern[] = [
  'leftToRight',
  'rightToLeft',
  'snake',
  'reverseSnake',
  'columnMajor',
];
