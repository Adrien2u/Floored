import { describe, it, expect } from 'vitest';
import {
  beginDrag,
  updateDrag,
  commitDrag,
  previewBounds,
  nudgeCommand,
  type DragOptions,
} from './drag';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import { applyCommand } from '$lib/document/commands';
import { elementBounds, type FloorElement } from '$lib/document/element';
import { inches } from '$lib/geometry/units';
import { DEFAULT_GRID_MM } from '$lib/geometry/snap';

const table = (id: string, x: number, y: number, locked = false): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked,
  label: id,
  center: { x, y },
  diameterMm: inches(60),
  seats: 8,
});

function planWith(...elements: FloorElement[]): FlooredDocument {
  let doc = createDocument();
  for (const e of elements) doc = addElement(doc, e);
  return doc;
}

/** Snapping off, so a test can check raw movement without interference. */
const free: DragOptions = { gridMm: 0, scale: 0.05, snapDisabled: true };
/** Grid on, alignment tolerance effectively off (huge scale = tiny tolerance). */
const gridOnly: DragOptions = { gridMm: DEFAULT_GRID_MM, scale: 1000 };

describe('beginDrag', () => {
  it('refuses an empty selection', () => {
    expect(beginDrag(planWith(table('a', 0, 0)), new Set(), { x: 0, y: 0 })).toBeNull();
  });

  it('refuses a selection of only locked elements', () => {
    const doc = planWith(table('a', 0, 0, true));
    expect(beginDrag(doc, new Set(['a']), { x: 0, y: 0 })).toBeNull();
  });

  it('drags the editable part of a mixed selection', () => {
    const doc = planWith(table('a', 0, 0, true), table('b', 5000, 0));
    const state = beginDrag(doc, new Set(['a', 'b']), { x: 0, y: 0 });
    expect(state?.ids).toEqual(['b']);
  });

  it('captures the bounds of the dragged set', () => {
    const doc = planWith(table('a', 0, 0), table('b', 10000, 0));
    const state = beginDrag(doc, new Set(['a', 'b']), { x: 0, y: 0 });
    expect(state?.startBounds.width).toBe(10000 + inches(60));
  });
});

describe('moving', () => {
  it('follows the pointer when snapping is off', () => {
    const doc = planWith(table('a', 0, 0));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    expect(state).not.toBeNull();
    if (!state) return;

    state = updateDrag(state, doc, { x: 1234, y: -567 }, free);
    expect(state.deltaMm).toEqual({ x: 1234, y: -567 });
  });

  it('snaps the movement to the grid', () => {
    const doc = planWith(table('a', 0, 0));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!state) return;

    // 160 mm with a 152 mm (6 inch) grid snaps to one step.
    state = updateDrag(state, doc, { x: 160, y: 0 }, gridOnly);
    expect(state.deltaMm.x).toBe(DEFAULT_GRID_MM);
  });

  it('produces a move command carrying the snapped delta', () => {
    const doc = planWith(table('a', 0, 0));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 3000, y: 2000 }, free);
    const command = commitDrag(state);

    expect(command).toEqual({ kind: 'move', ids: ['a'], dxMm: 3000, dyMm: 2000 });
  });

  it('actually moves the element when applied', () => {
    const doc = planWith(table('a', 1000, 1000));
    let state = beginDrag(doc, new Set(['a']), { x: 1000, y: 1000 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 4000, y: 1000 }, free);
    const command = commitDrag(state);
    expect(command).not.toBeNull();
    if (!command) return;

    const moved = applyCommand(doc, command);
    const element = moved.elements[0];
    expect(element?.type === 'roundTable' && element.center).toEqual({ x: 4000, y: 1000 });
  });

  it('returns null for a drag that ends where it started', () => {
    // A click that wobbles a pixel must not land on the undo stack.
    const doc = planWith(table('a', 0, 0));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 0, y: 0 }, free);
    expect(commitDrag(state)).toBeNull();
  });

  it('moves every element in a multi-selection by the same delta', () => {
    const doc = planWith(table('a', 0, 0), table('b', 5000, 0));
    let state = beginDrag(doc, new Set(['a', 'b']), { x: 0, y: 0 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 1000, y: 1000 }, free);
    const command = commitDrag(state);
    expect(command).not.toBeNull();
    if (!command) return;

    const moved = applyCommand(doc, command);
    for (const element of moved.elements) {
      expect(element.type === 'roundTable' && element.center.y).toBe(1000);
    }
  });
});

describe('alignment guides', () => {
  it('snaps a dragged table into line with a neighbour', () => {
    // 'b' sits 40 mm off centre-alignment with 'a'; a drag that lands near it
    // should be pulled the rest of the way.
    const doc = planWith(table('a', 0, 0), table('b', 10000, 6000));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!state) return;

    const options: DragOptions = { gridMm: 0, scale: 0.05 };
    state = updateDrag(state, doc, { x: 9960, y: 0 }, options);

    expect(state.guides.length).toBeGreaterThan(0);
    // Snapped onto the neighbour's alignment rather than left 40 mm short.
    expect(state.deltaMm.x).toBe(10000);
  });

  it('reports where the guide line sits, so the overlay can draw it', () => {
    const doc = planWith(table('a', 0, 0), table('b', 10000, 6000));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 9970, y: 0 }, { gridMm: 0, scale: 0.05 });

    const guide = state.guides.find((g) => g.axis === 'x');
    expect(guide).toBeDefined();
    if (!guide) return;

    // The guide's position is a real document coordinate on the neighbour, and
    // applying its delta is exactly what lands the dragged element on it.
    const neighbour = elementBounds(doc.elements[1]!);
    const edges = [neighbour.x, neighbour.x + neighbour.width / 2, neighbour.x + neighbour.width];
    expect(edges.map(Math.round)).toContain(guide.position);
  });

  it('never aligns to the elements being dragged', () => {
    const doc = planWith(table('a', 0, 0), table('b', 100, 0));
    let state = beginDrag(doc, new Set(['a', 'b']), { x: 0, y: 0 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 5000, y: 5000 }, { gridMm: 0, scale: 0.05 });
    expect(state.guides).toEqual([]);
  });

  it('ignores rooms, which would snap everything to the walls', () => {
    let doc = createDocument();
    doc = addElement(doc, {
      id: 'room',
      type: 'room',
      layer: 'room',
      rotationDeg: 0,
      locked: true,
      label: 'Hall',
      points: [
        { x: 0, y: 0 },
        { x: 20000, y: 0 },
        { x: 20000, y: 15000 },
        { x: 0, y: 15000 },
      ],
    });
    doc = addElement(doc, table('a', 5000, 5000));

    let state = beginDrag(doc, new Set(['a']), { x: 5000, y: 5000 });
    if (!state) return;

    // Dragging the table's edge right up to the wall must not snap to it.
    state = updateDrag(state, doc, { x: 5010, y: 5000 }, { gridMm: 0, scale: 0.05 });
    expect(state.guides).toEqual([]);
  });

  it('suspends all snapping when the modifier is held', () => {
    const doc = planWith(table('a', 0, 0), table('b', 10000, 6000));
    let state = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!state) return;

    state = updateDrag(state, doc, { x: 9963, y: 7 }, { ...free, gridMm: DEFAULT_GRID_MM });
    expect(state.deltaMm).toEqual({ x: 9963, y: 7 });
    expect(state.guides).toEqual([]);
  });

  it('keeps the snap tolerance constant on screen across zoom levels', () => {
    // The same 40 mm gap should snap when zoomed in and not when zoomed far out,
    // because tolerance is expressed in pixels the user can actually see.
    const doc = planWith(table('a', 0, 0), table('b', 10000, 6000));

    const zoomedIn = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    const zoomedOut = beginDrag(doc, new Set(['a']), { x: 0, y: 0 });
    if (!zoomedIn || !zoomedOut) return;

    const inState = updateDrag(zoomedIn, doc, { x: 9960, y: 0 }, { gridMm: 0, scale: 0.05 });
    const outState = updateDrag(zoomedOut, doc, { x: 9960, y: 0 }, { gridMm: 0, scale: 0.5 });

    expect(inState.guides.length).toBeGreaterThan(0);
    expect(outState.guides).toEqual([]);
  });
});

describe('previewBounds', () => {
  it('tracks the drag offset', () => {
    const doc = planWith(table('a', 1000, 1000));
    let state = beginDrag(doc, new Set(['a']), { x: 1000, y: 1000 });
    if (!state) return;

    const before = previewBounds(state);
    state = updateDrag(state, doc, { x: 3000, y: 1000 }, free);
    const after = previewBounds(state);

    expect(after.x - before.x).toBe(2000);
    expect(after.width).toBe(before.width);
  });
});

describe('nudge', () => {
  it('moves one grid step per press', () => {
    const doc = planWith(table('a', 0, 0));
    const command = nudgeCommand(doc, new Set(['a']), { x: 1, y: 0 }, DEFAULT_GRID_MM);
    expect(command).toEqual({ kind: 'move', ids: ['a'], dxMm: DEFAULT_GRID_MM, dyMm: 0 });
  });

  it('moves ten steps with shift held', () => {
    const doc = planWith(table('a', 0, 0));
    const command = nudgeCommand(doc, new Set(['a']), { x: 0, y: -1 }, DEFAULT_GRID_MM, true);
    expect(command).toEqual({ kind: 'move', ids: ['a'], dxMm: 0, dyMm: -DEFAULT_GRID_MM * 10 });
  });

  it('never produces a zero-distance nudge', () => {
    const doc = planWith(table('a', 0, 0));
    expect(nudgeCommand(doc, new Set(['a']), { x: 0, y: 0 }, DEFAULT_GRID_MM)).toBeNull();
  });

  it('refuses when nothing editable is selected', () => {
    const doc = planWith(table('a', 0, 0, true));
    expect(nudgeCommand(doc, new Set(['a']), { x: 1, y: 0 }, DEFAULT_GRID_MM)).toBeNull();
  });

  it('still moves a millimetre when the grid is off', () => {
    const doc = planWith(table('a', 0, 0));
    const command = nudgeCommand(doc, new Set(['a']), { x: 1, y: 0 }, 0);
    expect(command).toEqual({ kind: 'move', ids: ['a'], dxMm: 1, dyMm: 0 });
  });
});

describe('locked elements stay put', () => {
  it('a move command applied to a locked element does nothing', () => {
    const doc = planWith(table('a', 1000, 1000, true));
    const moved = applyCommand(doc, { kind: 'move', ids: ['a'], dxMm: 5000, dyMm: 0 });
    expect(elementBounds(moved.elements[0]!)).toEqual(elementBounds(doc.elements[0]!));
  });
});
