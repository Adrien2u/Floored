import { describe, it, expect } from 'vitest';
import {
  alignCommands,
  distributeCommands,
  duplicateCommands,
  arrayCommands,
  deleteCommands,
} from './arrange';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import { applyCommand, invertCommand, batch, type Command } from '$lib/document/commands';
import { elementBounds, type FloorElement } from '$lib/document/element';
import { inches } from '$lib/geometry/units';

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

function applyAll(doc: FlooredDocument, commands: Command[]): FlooredDocument {
  return commands.reduce(applyCommand, doc);
}

/** Deterministic ids, so a test can assert on them. */
function counterIds() {
  let n = 0;
  return () => `copy${String(++n)}`;
}

describe('align', () => {
  it('moves everything to the leftmost edge present', () => {
    const doc = planWith(table('a', 1000, 0), table('b', 5000, 0), table('c', 9000, 0));
    const result = applyAll(doc, alignCommands(doc, new Set(['a', 'b', 'c']), 'left'));

    const lefts = result.elements.map((e) => elementBounds(e).x);
    expect(new Set(lefts).size).toBe(1);
    expect(lefts[0]).toBe(1000 - inches(60) / 2);
  });

  it('aligns to the top', () => {
    const doc = planWith(table('a', 0, 2000), table('b', 0, 7000));
    const result = applyAll(doc, alignCommands(doc, new Set(['a', 'b']), 'top'));

    const tops = result.elements.map((e) => elementBounds(e).y);
    expect(new Set(tops).size).toBe(1);
  });

  it('centres horizontally on the selection midline', () => {
    const doc = planWith(table('a', 0, 0), table('b', 10000, 0));
    const result = applyAll(doc, alignCommands(doc, new Set(['a', 'b']), 'centerX'));

    const centres = result.elements.map((e) => {
      const b = elementBounds(e);
      return b.x + b.width / 2;
    });
    expect(centres[0]).toBe(centres[1]);
    expect(centres[0]).toBe(5000);
  });

  it('does nothing for a single element', () => {
    const doc = planWith(table('a', 1000, 0));
    expect(alignCommands(doc, new Set(['a']), 'left')).toEqual([]);
  });

  it('does nothing when the selection is already aligned', () => {
    const doc = planWith(table('a', 1000, 0), table('b', 1000, 5000));
    expect(alignCommands(doc, new Set(['a', 'b']), 'left')).toEqual([]);
  });

  it('leaves locked elements where they are', () => {
    const doc = planWith(table('a', 1000, 0), table('b', 9000, 0, true), table('c', 5000, 0));
    const result = applyAll(doc, alignCommands(doc, new Set(['a', 'b', 'c']), 'left'));

    const locked = result.elements.find((e) => e.id === 'b');
    expect(locked?.type === 'roundTable' && locked.center.x).toBe(9000);
  });
});

describe('distribute', () => {
  it('spaces elements evenly by centre', () => {
    const doc = planWith(
      table('a', 0, 0),
      table('b', 1000, 0), // bunched near the left
      table('c', 2000, 0),
      table('d', 12000, 0)
    );
    const result = applyAll(
      doc,
      distributeCommands(doc, new Set(['a', 'b', 'c', 'd']), 'horizontal')
    );

    const centres = result.elements
      .map((e) => (e.type === 'roundTable' ? e.center.x : 0))
      .sort((p, q) => p - q);

    const gaps = centres.slice(1).map((c, i) => c - (centres[i] ?? 0));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, -1);
  });

  it('leaves the outermost elements where they are', () => {
    const doc = planWith(table('a', 0, 0), table('b', 500, 0), table('c', 9000, 0));
    const result = applyAll(doc, distributeCommands(doc, new Set(['a', 'b', 'c']), 'horizontal'));

    const first = result.elements.find((e) => e.id === 'a');
    const last = result.elements.find((e) => e.id === 'c');
    expect(first?.type === 'roundTable' && first.center.x).toBe(0);
    expect(last?.type === 'roundTable' && last.center.x).toBe(9000);
  });

  it('distributes vertically', () => {
    const doc = planWith(table('a', 0, 0), table('b', 0, 500), table('c', 0, 9000));
    const result = applyAll(doc, distributeCommands(doc, new Set(['a', 'b', 'c']), 'vertical'));

    const middle = result.elements.find((e) => e.id === 'b');
    expect(middle?.type === 'roundTable' && middle.center.y).toBeCloseTo(4500, -1);
  });

  it('needs at least three elements to mean anything', () => {
    const doc = planWith(table('a', 0, 0), table('b', 5000, 0));
    expect(distributeCommands(doc, new Set(['a', 'b']), 'horizontal')).toEqual([]);
  });

  it('does nothing when every element sits at the same place', () => {
    const doc = planWith(table('a', 0, 0), table('b', 0, 0), table('c', 0, 0));
    expect(distributeCommands(doc, new Set(['a', 'b', 'c']), 'horizontal')).toEqual([]);
  });
});

describe('duplicate', () => {
  it('adds a copy offset from the original', () => {
    const doc = planWith(table('a', 1000, 1000));
    const result = applyAll(
      doc,
      duplicateCommands(doc, new Set(['a']), { x: 500, y: 500 }, counterIds())
    );

    expect(result.elements).toHaveLength(2);
    const copy = result.elements.find((e) => e.id === 'copy1');
    expect(copy?.type === 'roundTable' && copy.center).toEqual({ x: 1500, y: 1500 });
  });

  it('gives the copy a fresh id, since duplicates would break removal', () => {
    const doc = planWith(table('a', 0, 0));
    const commands = duplicateCommands(doc, new Set(['a']), { x: 100, y: 0 }, counterIds());
    const inserted = commands[0];

    expect(inserted?.kind === 'insert' && inserted.element.id).toBe('copy1');
  });

  it('unlocks the copy, so it can be moved immediately', () => {
    const doc = planWith(table('a', 0, 0, true));
    const result = applyAll(
      doc,
      duplicateCommands(doc, new Set(['a']), { x: 500, y: 0 }, counterIds())
    );

    expect(result.elements.find((e) => e.id === 'copy1')?.locked).toBe(false);
  });

  it('places copies on top of the draw order', () => {
    const doc = planWith(table('a', 0, 0), table('b', 5000, 0));
    const result = applyAll(
      doc,
      duplicateCommands(doc, new Set(['a']), { x: 100, y: 0 }, counterIds())
    );

    expect(result.elements[result.elements.length - 1]?.id).toBe('copy1');
  });

  it('duplicates a whole multi-selection', () => {
    const doc = planWith(table('a', 0, 0), table('b', 5000, 0));
    const result = applyAll(
      doc,
      duplicateCommands(doc, new Set(['a', 'b']), { x: 0, y: 3000 }, counterIds())
    );

    expect(result.elements).toHaveLength(4);
  });

  it('does nothing for an empty selection', () => {
    expect(duplicateCommands(planWith(table('a', 0, 0)), new Set(), { x: 1, y: 1 })).toEqual([]);
  });
});

describe('array', () => {
  it('fills a grid, counting the original as the first cell', () => {
    const doc = planWith(table('a', 0, 0));
    const result = applyAll(
      doc,
      arrayCommands(doc, new Set(['a']), 3, 2, { x: 3048, y: 3048 }, counterIds())
    );

    // 3 x 2 = 6 cells, one of which is the original.
    expect(result.elements).toHaveLength(6);
  });

  it('spaces copies at the requested pitch', () => {
    const doc = planWith(table('a', 0, 0));
    const result = applyAll(
      doc,
      arrayCommands(doc, new Set(['a']), 2, 1, { x: 3048, y: 0 }, counterIds())
    );

    const copy = result.elements.find((e) => e.id === 'copy1');
    expect(copy?.type === 'roundTable' && copy.center).toEqual({ x: 3048, y: 0 });
  });

  it('lays out a banquet room in one action', () => {
    // The workhorse case: one table becomes a 5 x 3 room of 15.
    const doc = planWith(table('a', 0, 0));
    const commands = arrayCommands(doc, new Set(['a']), 5, 3, { x: 3048, y: 3048 }, counterIds());
    const result = applyAll(doc, commands);

    expect(result.elements).toHaveLength(15);
    // One user action, and the plan is laid out.
    expect(commands).toHaveLength(14);
  });

  it('refuses a one-by-one array, which would copy nothing', () => {
    const doc = planWith(table('a', 0, 0));
    expect(arrayCommands(doc, new Set(['a']), 1, 1, { x: 100, y: 100 })).toEqual([]);
  });

  it('refuses zero or negative counts', () => {
    const doc = planWith(table('a', 0, 0));
    expect(arrayCommands(doc, new Set(['a']), 0, 3, { x: 100, y: 0 })).toEqual([]);
    expect(arrayCommands(doc, new Set(['a']), 3, -1, { x: 100, y: 0 })).toEqual([]);
  });
});

describe('delete', () => {
  it('removes the selection', () => {
    const doc = planWith(table('a', 0, 0), table('b', 5000, 0));
    const result = applyAll(doc, deleteCommands(doc, new Set(['a'])));

    expect(result.elements.map((e) => e.id)).toEqual(['b']);
  });

  it('keeps locked elements', () => {
    const doc = planWith(table('a', 0, 0, true), table('b', 5000, 0));
    const result = applyAll(doc, deleteCommands(doc, new Set(['a', 'b'])));

    expect(result.elements.map((e) => e.id)).toEqual(['a']);
  });

  it('deletes several elements without the indices going stale', () => {
    // Commands are built in reverse draw order for exactly this reason:
    // removing front-to-back would shift every index after it.
    const doc = planWith(
      table('a', 0, 0),
      table('b', 1000, 0),
      table('c', 2000, 0),
      table('d', 3000, 0)
    );
    const result = applyAll(doc, deleteCommands(doc, new Set(['a', 'c'])));

    expect(result.elements.map((e) => e.id)).toEqual(['b', 'd']);
  });

  it('restores the exact draw order when undone', () => {
    // Deleting from the middle is where a naive implementation re-inserts on
    // top instead of back into position.
    const doc = planWith(table('a', 0, 0), table('b', 1000, 0), table('c', 2000, 0));

    const command = batch('Delete', deleteCommands(doc, new Set(['b'])));
    expect(command).not.toBeNull();
    if (!command) return;

    const deleted = applyCommand(doc, command);
    expect(deleted.elements.map((e) => e.id)).toEqual(['a', 'c']);

    const restored = applyCommand(deleted, invertCommand(command));
    expect(restored.elements.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(restored).toEqual(doc);
  });

  it('undoes a multi-element delete as one step, in the right order', () => {
    const doc = planWith(
      table('a', 0, 0),
      table('b', 1000, 0),
      table('c', 2000, 0),
      table('d', 3000, 0)
    );

    const command = batch('Delete', deleteCommands(doc, new Set(['a', 'c'])));
    if (!command) return;

    const deleted = applyCommand(doc, command);
    expect(deleted.elements.map((e) => e.id)).toEqual(['b', 'd']);
    expect(applyCommand(deleted, invertCommand(command))).toEqual(doc);
  });

  it('does nothing for an empty selection', () => {
    expect(deleteCommands(planWith(table('a', 0, 0)), new Set())).toEqual([]);
  });
});
