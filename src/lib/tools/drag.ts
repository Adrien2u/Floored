/**
 * The move gesture.
 *
 * Written as a pure state machine — `begin`, `update`, `commit` — rather than as
 * pointer handlers, so the interesting behaviour (snapping, alignment guides,
 * locked elements, a drag that ends where it started) is testable without a
 * canvas or a pointer.
 *
 * ADR-0001 named the interaction surface as the renderer's second-biggest risk.
 * This shape is the mitigation: the logic is ordinary code with tests, and the
 * pointer handlers on top of it stay thin enough to read in one sitting.
 */

import type { ElementId } from '$lib/document/element';
import { elementBounds } from '$lib/document/element';
import type { FlooredDocument } from '$lib/document/document';
import type { Command } from '$lib/document/commands';
import type { Point } from '$lib/geometry/vec';
import type { Rect } from '$lib/geometry/transform';
import { boundsOf } from '$lib/geometry/transform';
import { snapValue, alignmentGuides, type AlignmentGuide } from '$lib/geometry/snap';
import { editableIds } from './selection';

/** How close, in screen pixels, an edge must be to snap to a neighbour. */
export const ALIGN_TOLERANCE_PX = 6;

export interface DragState {
  readonly ids: readonly ElementId[];
  /** Document point where the pointer went down. */
  readonly startMm: Point;
  /** Bounds of the dragged set at gesture start, used for alignment. */
  readonly startBounds: Rect;
  /** Current offset from the start, after snapping. */
  readonly deltaMm: Point;
  /** Guides currently being snapped to, for the overlay to draw. */
  readonly guides: readonly AlignmentGuide[];
}

export interface DragOptions {
  /** Grid spacing in millimetres. Zero disables grid snapping. */
  readonly gridMm: number;
  /** Screen pixels per millimetre, so tolerances stay constant on screen. */
  readonly scale: number;
  /** Held modifier that suspends snapping — usually Alt. */
  readonly snapDisabled?: boolean;
}

/**
 * Begin a drag.
 *
 * Returns `null` when there is nothing movable: an empty selection, or one
 * containing only locked elements. A gesture that cannot do anything should not
 * start, rather than starting and quietly refusing to move.
 */
export function beginDrag(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  startMm: Point
): DragState | null {
  const ids = editableIds(doc, selection);
  if (ids.length === 0) return null;

  return {
    ids,
    startMm,
    startBounds: boundsOfIds(doc, ids),
    deltaMm: { x: 0, y: 0 },
    guides: [],
  };
}

/**
 * Advance the drag to a new pointer position.
 *
 * Snapping runs in two passes, and the order matters. Alignment to neighbouring
 * elements wins over the grid, because a user dragging a table into line with
 * the row above cares about the row, not about whether the result lands on a
 * six-inch multiple.
 */
export function updateDrag(
  state: DragState,
  doc: FlooredDocument,
  currentMm: Point,
  options: DragOptions
): DragState {
  const rawDelta = {
    x: currentMm.x - state.startMm.x,
    y: currentMm.y - state.startMm.y,
  };

  if (options.snapDisabled) {
    return { ...state, deltaMm: rawDelta, guides: [] };
  }

  const moved: Rect = {
    ...state.startBounds,
    x: state.startBounds.x + rawDelta.x,
    y: state.startBounds.y + rawDelta.y,
  };

  const dragging = new Set(state.ids);
  const candidates = doc.elements
    .filter((e) => !dragging.has(e.id) && e.type !== 'room')
    .map((e) => elementBounds(e));

  // Tolerance is expressed in screen pixels so it feels the same at every zoom.
  const toleranceMm = options.scale > 0 ? ALIGN_TOLERANCE_PX / options.scale : 0;
  const guides = alignmentGuides(moved, candidates, toleranceMm);

  const bestX = guides.find((g) => g.axis === 'x');
  const bestY = guides.find((g) => g.axis === 'y');

  const delta = {
    x: bestX ? rawDelta.x + bestX.deltaMm : snapValue(rawDelta.x, options.gridMm),
    y: bestY ? rawDelta.y + bestY.deltaMm : snapValue(rawDelta.y, options.gridMm),
  };

  const active = [bestX, bestY].filter((g): g is AlignmentGuide => g !== undefined);
  return { ...state, deltaMm: delta, guides: active };
}

/**
 * Finish the drag.
 *
 * Returns `null` for a zero-length move, so a click that happens to wobble a
 * pixel does not deposit a no-op on the undo stack. Everything the user can
 * undo should be something they meant to do.
 */
export function commitDrag(state: DragState): Command | null {
  if (state.deltaMm.x === 0 && state.deltaMm.y === 0) return null;
  return {
    kind: 'move',
    ids: state.ids,
    dxMm: state.deltaMm.x,
    dyMm: state.deltaMm.y,
  };
}

/** Where the dragged elements currently appear, for the drag preview. */
export function previewBounds(state: DragState): Rect {
  return {
    ...state.startBounds,
    x: state.startBounds.x + state.deltaMm.x,
    y: state.startBounds.y + state.deltaMm.y,
  };
}

/**
 * Nudge a selection by the arrow keys.
 *
 * A bare arrow moves one grid step; holding shift moves ten, which is the
 * convention in every drawing tool and the reason nobody has to be told it.
 */
export function nudgeCommand(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  direction: { x: number; y: number },
  gridMm: number,
  large = false
): Command | null {
  const ids = editableIds(doc, selection);
  if (ids.length === 0) return null;

  const step = Math.max(1, gridMm) * (large ? 10 : 1);
  const dxMm = direction.x * step;
  const dyMm = direction.y * step;
  if (dxMm === 0 && dyMm === 0) return null;

  return { kind: 'move', ids, dxMm, dyMm };
}

function boundsOfIds(doc: FlooredDocument, ids: readonly ElementId[]): Rect {
  const wanted = new Set(ids);
  const corners = doc.elements
    .filter((e) => wanted.has(e.id))
    .flatMap((e) => {
      const b = elementBounds(e);
      return [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y + b.height },
      ];
    });
  return boundsOf(corners);
}
