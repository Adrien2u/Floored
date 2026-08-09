import { describe, it, expect } from 'vitest';
import { createDocument, addElement, findElement } from './document';
import {
  addCommand,
  removeCommand,
  modifyCommand,
  applyCommand,
  invertCommand,
  describeCommand,
  batch,
  type Command,
} from './commands';
import {
  createHistory,
  push,
  undo,
  redo,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  clearHistory,
  HISTORY_LIMIT,
  type HistoryState,
} from './history';
import type { FloorElement } from './element';
import { inches } from '$lib/geometry/units';

const table = (id: string, x = 0, y = 0): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id,
  center: { x, y },
  diameterMm: inches(60),
  seats: 8,
});

const start = (): HistoryState => ({ document: createDocument(), history: createHistory() });

describe('command inversion is exact', () => {
  // This is the property the whole undo system rests on. If applying a command
  // and then its inverse does not reproduce the original document byte for
  // byte, undo is lying, and the user will not find out until they print.

  const cases: { name: string; build: (state: HistoryState) => Command | null }[] = [
    { name: 'insert', build: (s) => addCommand(s.document, table('t2', 1000, 1000)) },
    { name: 'move', build: () => ({ kind: 'move', ids: ['t1'], dxMm: 250, dyMm: -125 }) },
    {
      name: 'meta',
      build: (s) => ({ kind: 'meta', before: s.document.meta, after: { name: 'Renamed' } }),
    },
  ];

  for (const { name, build } of cases) {
    it(`round-trips a ${name} command`, () => {
      const base = { ...start(), document: addElement(createDocument(), table('t1', 500, 500)) };
      const command = build(base);
      expect(command).not.toBeNull();
      if (!command) return;

      const applied = applyCommand(base.document, command);
      const reverted = applyCommand(applied, invertCommand(command));

      expect(reverted).toEqual(base.document);
    });
  }

  it('round-trips a remove, restoring the original draw order', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a'));
    doc = addElement(doc, table('b'));
    doc = addElement(doc, table('c'));

    // Removing the middle element is the case a naive implementation gets
    // wrong: it re-adds on top instead of back into position.
    const command = removeCommand(doc, 'b');
    expect(command).not.toBeNull();
    if (!command) return;

    const applied = applyCommand(doc, command);
    expect(applied.elements.map((e) => e.id)).toEqual(['a', 'c']);

    const reverted = applyCommand(applied, invertCommand(command));
    expect(reverted.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(reverted).toEqual(doc);
  });

  it('round-trips a modify', () => {
    const doc = addElement(createDocument(), table('t1'));
    const command = modifyCommand(doc, { ...table('t1'), label: 'Head table' });
    expect(command).not.toBeNull();
    if (!command) return;

    const applied = applyCommand(doc, command);
    expect(findElement(applied, 't1')?.label).toBe('Head table');
    expect(applyCommand(applied, invertCommand(command))).toEqual(doc);
  });

  it('inverting twice returns the original command', () => {
    const command = addCommand(createDocument(), table('t1'));
    expect(invertCommand(invertCommand(command))).toEqual(command);
  });
});

describe('no-op commands are refused', () => {
  it('returns null when modifying changes nothing', () => {
    const doc = addElement(createDocument(), table('t1'));
    expect(modifyCommand(doc, table('t1'))).toBeNull();
  });

  it('returns null when removing an element that is not there', () => {
    expect(removeCommand(createDocument(), 'ghost')).toBeNull();
  });

  it('push ignores a null command, so callers need no guard', () => {
    const state = start();
    expect(push(state, null)).toBe(state);
  });
});

describe('undo and redo', () => {
  it('starts with neither available', () => {
    const state = start();
    expect(canUndo(state.history)).toBe(false);
    expect(canRedo(state.history)).toBe(false);
  });

  it('undoes a single change', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('t1')));
    expect(state.document.elements).toHaveLength(1);

    state = undo(state);
    expect(state.document.elements).toHaveLength(0);
    expect(canRedo(state.history)).toBe(true);
  });

  it('redoes what it undid', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('t1')));
    const afterAdd = state.document;

    state = redo(undo(state));
    expect(state.document).toEqual(afterAdd);
  });

  it('walks a long history back to the empty document and forward again', () => {
    let state = start();
    const checkpoints = [state.document];

    for (let i = 0; i < 25; i++) {
      state = push(state, addCommand(state.document, table(`t${String(i)}`, i * 100, 0)));
      state = push(state, { kind: 'move', ids: [`t${String(i)}`], dxMm: 50, dyMm: 50 });
      checkpoints.push(state.document);
    }

    for (let i = checkpoints.length - 1; i > 0; i--) {
      state = undo(undo(state));
    }
    expect(state.document).toEqual(checkpoints[0]);

    for (let i = 0; i < 25; i++) {
      state = redo(redo(state));
    }
    expect(state.document).toEqual(checkpoints[checkpoints.length - 1]);
  });

  it('is a no-op at the ends of the stack rather than throwing', () => {
    const state = start();
    expect(undo(state)).toBe(state);
    expect(redo(state)).toBe(state);
  });

  it('clears the redo stack when a new command branches the timeline', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('a')));
    state = undo(state);
    expect(canRedo(state.history)).toBe(true);

    state = push(state, addCommand(state.document, table('b')));
    expect(canRedo(state.history)).toBe(false);
    expect(state.document.elements.map((e) => e.id)).toEqual(['b']);
  });

  it('caps the history without corrupting the document', () => {
    let state = start();
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      state = push(state, addCommand(state.document, table(`t${String(i)}`)));
    }

    expect(state.history.past).toHaveLength(HISTORY_LIMIT);
    expect(state.document.elements).toHaveLength(HISTORY_LIMIT + 20);

    // The oldest actions fall off the stack, so undo cannot reach the empty
    // document — but every undo it can still do must be correct.
    state = undo(state);
    expect(state.document.elements).toHaveLength(HISTORY_LIMIT + 19);
  });

  it('clears history without touching the document', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('t1')));
    const doc = state.document;

    state = clearHistory(state);
    expect(state.document).toBe(doc);
    expect(canUndo(state.history)).toBe(false);
  });
});

describe('labels', () => {
  it('names the action a user would be undoing', () => {
    let state = start();
    state = push(state, addCommand(state.document, { ...table('t1'), label: 'Head table' }));
    expect(undoLabel(state.history)).toBe('Add Head table');

    state = undo(state);
    expect(redoLabel(state.history)).toBe('Add Head table');
  });

  it('has no label when there is nothing to undo', () => {
    expect(undoLabel(createHistory())).toBeNull();
    expect(redoLabel(createHistory())).toBeNull();
  });

  it('pluralizes a multi-element move', () => {
    expect(describeCommand({ kind: 'move', ids: ['a'], dxMm: 1, dyMm: 0 })).toBe('Move');
    expect(describeCommand({ kind: 'move', ids: ['a', 'b'], dxMm: 1, dyMm: 0 })).toBe(
      'Move 2 items'
    );
  });

  it('falls back to the element type when it has no label', () => {
    const command = addCommand(createDocument(), { ...table('t1'), label: '' });
    expect(describeCommand(command)).toBe('Add roundTable');
  });
});

describe('batch commands', () => {
  // Aligning eight tables is one thing the user did. It must cost one Ctrl+Z,
  // not eight, or undo feels broken in a way that is hard to describe and
  // impossible to ignore.

  it('applies every sub-command', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a'));
    doc = addElement(doc, table('b'));

    const command = batch('Align left', [
      { kind: 'move', ids: ['a'], dxMm: 500, dyMm: 0 },
      { kind: 'move', ids: ['b'], dxMm: 250, dyMm: 0 },
    ]);
    expect(command).not.toBeNull();
    if (!command) return;

    const applied = applyCommand(doc, command);
    const [first, second] = applied.elements;
    expect(first?.type === 'roundTable' && first.center.x).toBe(500);
    expect(second?.type === 'roundTable' && second.center.x).toBe(250);
  });

  it('inverts exactly, restoring the original document', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a'));
    doc = addElement(doc, table('b'));
    doc = addElement(doc, table('c'));

    const command = batch('Delete two', [
      { kind: 'remove', element: doc.elements[2]!, index: 2 },
      { kind: 'remove', element: doc.elements[0]!, index: 0 },
    ]);
    if (!command) return;

    const applied = applyCommand(doc, command);
    expect(applied.elements.map((e) => e.id)).toEqual(['b']);

    // Reverse order on invert is what keeps the captured indices valid.
    expect(applyCommand(applied, invertCommand(command))).toEqual(doc);
  });

  it('undoes as a single history entry', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('a')));
    state = push(state, addCommand(state.document, table('b')));
    const beforeAlign = state.document;

    state = push(
      state,
      batch('Align left', [
        { kind: 'move', ids: ['a'], dxMm: 500, dyMm: 0 },
        { kind: 'move', ids: ['b'], dxMm: 250, dyMm: 0 },
      ])
    );

    state = undo(state);
    expect(state.document).toEqual(beforeAlign);
    // One undo was enough; the adds are still there to undo separately.
    expect(canUndo(state.history)).toBe(true);
  });

  it('redoes as a single entry too', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('a')));

    const command = batch('Nudge twice', [
      { kind: 'move', ids: ['a'], dxMm: 100, dyMm: 0 },
      { kind: 'move', ids: ['a'], dxMm: 0, dyMm: 100 },
    ]);
    if (!command) return;

    state = push(state, command);
    const afterBatch = state.document;

    state = redo(undo(state));
    expect(state.document).toEqual(afterBatch);
  });

  it('carries its own label into the undo menu', () => {
    let state = start();
    state = push(state, addCommand(state.document, table('a')));
    state = push(
      state,
      batch('Align left', [
        { kind: 'move', ids: ['a'], dxMm: 1, dyMm: 0 },
        { kind: 'move', ids: ['a'], dxMm: 1, dyMm: 0 },
      ])
    );

    expect(undoLabel(state.history)).toBe('Align left');
  });

  it('returns null for an empty list rather than an empty batch', () => {
    expect(batch('Nothing', [])).toBeNull();
  });

  it('unwraps a single command, whose own label is more useful', () => {
    const single = { kind: 'move', ids: ['a'], dxMm: 1, dyMm: 0 } as const;
    expect(batch('Align left', [single])).toBe(single);
  });

  it('nests without losing exactness', () => {
    let doc = createDocument();
    doc = addElement(doc, table('a'));

    const inner = batch('Inner', [
      { kind: 'move', ids: ['a'], dxMm: 100, dyMm: 0 },
      { kind: 'move', ids: ['a'], dxMm: 0, dyMm: 100 },
    ]);
    if (!inner) return;

    const outer = batch('Outer', [inner, { kind: 'move', ids: ['a'], dxMm: 50, dyMm: 50 }]);
    if (!outer) return;

    const applied = applyCommand(doc, outer);
    expect(applyCommand(applied, invertCommand(outer))).toEqual(doc);
  });
});
