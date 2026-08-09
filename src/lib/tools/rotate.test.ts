import { describe, it, expect } from 'vitest';
import {
  beginRotate,
  updateRotate,
  commitRotate,
  previewElement,
  rotateByCommands,
  ROTATE_SNAP_DEGREES,
} from './rotate';
import { createDocument, addElement, findElement } from '$lib/document/document';
import { applyCommand } from '$lib/document/commands';
import type { FloorElement } from '$lib/document/element';
import { inches } from '$lib/geometry/units';

const rectTable = (id: string, rotationDeg = 0, locked = false): FloorElement => ({
  id,
  type: 'rectTable',
  layer: 'furniture',
  rotationDeg,
  locked,
  label: id,
  origin: { x: 0, y: 0 },
  widthMm: inches(96),
  depthMm: inches(30),
  seats: 8,
});

const room: FloorElement = {
  id: 'room',
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: false,
  label: 'Hall',
  points: [
    { x: 0, y: 0 },
    { x: 10000, y: 0 },
    { x: 10000, y: 8000 },
    { x: 0, y: 8000 },
  ],
};

const pivot = { x: 0, y: 0 };
/** Pointer directly right of the pivot — zero degrees. */
const east = { x: 1000, y: 0 };
/** Pointer directly below the pivot — ninety degrees, since +y is down. */
const south = { x: 0, y: 1000 };

function planWith(...elements: FloorElement[]) {
  let doc = createDocument();
  for (const e of elements) doc = addElement(doc, e);
  return doc;
}

describe('beginRotate', () => {
  it('refuses a locked element', () => {
    const doc = planWith(rectTable('a', 0, true));
    expect(beginRotate(doc, 'a', pivot, east)).toBeNull();
  });

  it('refuses a room, whose orientation lives in its vertices', () => {
    const doc = planWith(room);
    expect(beginRotate(doc, 'room', pivot, east)).toBeNull();
  });

  it('refuses an element that is not there', () => {
    expect(beginRotate(createDocument(), 'ghost', pivot, east)).toBeNull();
  });

  it('captures the starting rotation', () => {
    const doc = planWith(rectTable('a', 45));
    expect(beginRotate(doc, 'a', pivot, east)?.startRotationDeg).toBe(45);
  });
});

describe('rotating', () => {
  it('follows the pointer, snapped to the step', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    expect(state).not.toBeNull();
    if (!state) return;

    state = updateRotate(state, south);
    expect(state.rotationDeg).toBe(90);
  });

  it('snaps to fifteen degree steps by default', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    // 20 degrees round-trips to the nearest step, which is 15.
    state = updateRotate(state, { x: Math.cos(0.349) * 1000, y: Math.sin(0.349) * 1000 });
    expect(state.rotationDeg % ROTATE_SNAP_DEGREES).toBe(0);
  });

  it('rotates freely when the modifier is held', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    state = updateRotate(state, south, { snapDisabled: true });
    expect(state.rotationDeg).toBeCloseTo(90, 6);
  });

  it('accepts a custom step', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    state = updateRotate(state, south, { stepDegrees: 45 });
    expect(state.rotationDeg % 45).toBe(0);
  });

  it('adds the swept angle to the starting rotation', () => {
    const doc = planWith(rectTable('a', 45));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    // A quarter turn from a start of 45 lands on 135.
    state = updateRotate(state, south, { snapDisabled: true });
    expect(state.rotationDeg).toBeCloseTo(135, 6);
  });
});

describe('drift', () => {
  // ADR-0006's warning has teeth here. Each update must rotate the element's
  // ORIGINAL angle by the total swept angle, never the previous frame's result
  // by a small delta — otherwise a long drag walks the element.

  it('does not accumulate error across many updates', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    // Sweep the pointer all the way round in 360 small steps, returning to the
    // start. The result must be exactly where it began.
    for (let deg = 0; deg <= 360; deg++) {
      const rad = (deg * Math.PI) / 180;
      state = updateRotate(state, { x: Math.cos(rad) * 1000, y: Math.sin(rad) * 1000 });
    }

    expect(state.rotationDeg).toBe(0);
  });

  it('lands on the same angle whether swept in one step or many', () => {
    const doc = planWith(rectTable('a'));

    const direct = updateRotate(beginRotate(doc, 'a', pivot, east)!, south, {
      snapDisabled: true,
    });

    let stepped = beginRotate(doc, 'a', pivot, east)!;
    for (let deg = 0; deg <= 90; deg += 1) {
      const rad = (deg * Math.PI) / 180;
      stepped = updateRotate(
        stepped,
        { x: Math.cos(rad) * 1000, y: Math.sin(rad) * 1000 },
        { snapDisabled: true }
      );
    }

    expect(stepped.rotationDeg).toBeCloseTo(direct.rotationDeg, 6);
  });
});

describe('commitRotate', () => {
  it('produces a modify command', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    state = updateRotate(state, south);
    const command = commitRotate(state, doc);
    expect(command?.kind).toBe('modify');
  });

  it('applies the rotation to the document', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    state = updateRotate(state, south);
    const command = commitRotate(state, doc);
    if (!command) return;

    expect(findElement(applyCommand(doc, command), 'a')?.rotationDeg).toBe(90);
  });

  it('returns null when the angle did not change', () => {
    const doc = planWith(rectTable('a'));
    const state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    expect(commitRotate(state, doc)).toBeNull();
  });

  it('returns null when the element vanished mid-gesture', () => {
    const doc = planWith(rectTable('a'));
    const state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    expect(commitRotate(updateRotate(state, south), createDocument())).toBeNull();
  });
});

describe('previewElement', () => {
  it('shows the element at its in-progress angle', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    state = updateRotate(state, south);
    expect(previewElement(state, doc)?.rotationDeg).toBe(90);
  });

  it('leaves the document untouched', () => {
    const doc = planWith(rectTable('a'));
    let state = beginRotate(doc, 'a', pivot, east);
    if (!state) return;

    state = updateRotate(state, south);
    previewElement(state, doc);

    expect(findElement(doc, 'a')?.rotationDeg).toBe(0);
  });
});

describe('rotateByCommands', () => {
  it('turns every eligible element by a fixed amount', () => {
    const doc = planWith(rectTable('a'), rectTable('b'));
    const commands = rotateByCommands(doc, new Set(['a', 'b']), 90);
    expect(commands).toHaveLength(2);
  });

  it('skips rooms and locked elements rather than refusing the whole action', () => {
    const doc = planWith(rectTable('a'), rectTable('b', 0, true), room);
    const commands = rotateByCommands(doc, new Set(['a', 'b', 'room']), 90);
    expect(commands).toHaveLength(1);
  });

  it('wraps past a full turn', () => {
    const doc = planWith(rectTable('a', 315));
    const commands = rotateByCommands(doc, new Set(['a']), 90);

    let result = doc;
    for (const command of commands) result = applyCommand(result, command);
    expect(findElement(result, 'a')?.rotationDeg).toBe(45);
  });

  it('produces nothing for an empty selection', () => {
    expect(rotateByCommands(planWith(rectTable('a')), new Set(), 90)).toEqual([]);
  });
});
