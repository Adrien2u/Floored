import { describe, it, expect } from 'vitest';
import {
  selectOnly,
  toggle,
  add,
  remove,
  selectAll,
  prune,
  selectedElements,
  hasEditableElements,
  editableIds,
  EMPTY_SELECTION,
} from './selection';
import { createDocument, addElement, removeElement } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches } from '$lib/geometry/units';

const table = (id: string, locked = false, layer = 'furniture'): FloorElement => ({
  id,
  type: 'roundTable',
  layer,
  rotationDeg: 0,
  locked,
  label: id,
  center: { x: 1000, y: 1000 },
  diameterMm: inches(60),
  seats: 8,
});

function planWith(...elements: FloorElement[]) {
  let doc = createDocument();
  for (const e of elements) doc = addElement(doc, e);
  return doc;
}

describe('basic set operations', () => {
  it('selects a single element', () => {
    expect([...selectOnly('a')]).toEqual(['a']);
  });

  it('clears with null', () => {
    expect(selectOnly(null).size).toBe(0);
  });

  it('toggles in and back out', () => {
    let s = EMPTY_SELECTION;
    s = toggle(s, 'a');
    expect(s.has('a')).toBe(true);
    s = toggle(s, 'a');
    expect(s.has('a')).toBe(false);
  });

  it('toggling lets a user correct a mis-click without starting over', () => {
    let s = new Set(['a', 'b', 'c']) as ReadonlySet<string>;
    s = toggle(s, 'b');
    expect([...s].sort()).toEqual(['a', 'c']);
  });

  it('adds and removes in bulk', () => {
    let s = add(EMPTY_SELECTION, ['a', 'b', 'c']);
    expect(s.size).toBe(3);
    s = remove(s, ['b']);
    expect([...s].sort()).toEqual(['a', 'c']);
  });

  it('never mutates the input selection', () => {
    const original = new Set(['a']) as ReadonlySet<string>;
    toggle(original, 'b');
    add(original, ['c']);
    remove(original, ['a']);
    expect([...original]).toEqual(['a']);
  });
});

describe('selectAll', () => {
  it('selects everything visible', () => {
    const doc = planWith(table('a'), table('b'));
    expect(selectAll(doc, new Set()).size).toBe(2);
  });

  it('skips hidden layers, so handles never float over nothing', () => {
    const doc = planWith(table('a'), table('b', false, 'hidden'));
    expect([...selectAll(doc, new Set(['hidden']))]).toEqual(['a']);
  });

  it('includes locked elements, which are selectable but not movable', () => {
    const doc = planWith(table('a', true));
    expect(selectAll(doc, new Set()).size).toBe(1);
  });
});

describe('prune', () => {
  it('drops ids that are no longer in the document', () => {
    let doc = planWith(table('a'), table('b'));
    const selection = selectAll(doc, new Set());

    doc = removeElement(doc, 'a');
    expect([...prune(selection, doc)]).toEqual(['b']);
  });

  it('leaves a valid selection alone', () => {
    const doc = planWith(table('a'));
    const selection = selectOnly('a');
    expect([...prune(selection, doc)]).toEqual(['a']);
  });

  it('empties a selection whose document was replaced entirely', () => {
    const selection = new Set(['a', 'b']) as ReadonlySet<string>;
    expect(prune(selection, createDocument()).size).toBe(0);
  });
});

describe('locked elements', () => {
  it('reports a selection of only locked elements as not editable', () => {
    const doc = planWith(table('a', true), table('b', true));
    expect(hasEditableElements(doc, selectAll(doc, new Set()))).toBe(false);
  });

  it('reports a mixed selection as editable', () => {
    const doc = planWith(table('a', true), table('b', false));
    expect(hasEditableElements(doc, selectAll(doc, new Set()))).toBe(true);
  });

  it('lists only the editable ids', () => {
    const doc = planWith(table('a', true), table('b', false), table('c', false));
    expect(editableIds(doc, selectAll(doc, new Set()))).toEqual(['b', 'c']);
  });
});

describe('selectedElements', () => {
  it('returns elements in draw order, not selection order', () => {
    const doc = planWith(table('a'), table('b'), table('c'));
    const selection = new Set(['c', 'a']) as ReadonlySet<string>;
    expect(selectedElements(doc, selection).map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('ignores ids that are not present', () => {
    const doc = planWith(table('a'));
    expect(selectedElements(doc, new Set(['ghost']))).toEqual([]);
  });
});
