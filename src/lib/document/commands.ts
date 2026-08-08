/**
 * Commands — every document change, paired with its exact inverse.
 *
 * ADR-0003 chose a command stack over document snapshots: snapshots are simpler
 * but cost a full copy per edit, which does not scale to a 2,000-element plan
 * with a deep history.
 *
 * A command must be **exactly** invertible: applying a command and then its
 * inverse has to return a document deep-equal to the original, draw order
 * included. Insert and remove are therefore symmetric — both carry a concrete
 * index rather than one appending and the other guessing where the element
 * came from. An undo that restores a table to the wrong layer position is worse
 * than no undo, because the user will not notice until it prints.
 */

import type { FlooredDocument, DocumentMeta } from './document';
import {
  insertElement,
  removeElement,
  replaceElement,
  findElement,
  indexOfElement,
  updateMeta,
} from './document';
import type { FloorElement, ElementId } from './element';
import { moveElement } from './element';

export type Command =
  | {
      readonly kind: 'insert';
      readonly element: FloorElement;
      /** Position in the draw order. Always concrete, never "append". */
      readonly index: number;
    }
  | {
      readonly kind: 'remove';
      readonly element: FloorElement;
      readonly index: number;
    }
  | {
      readonly kind: 'move';
      readonly ids: readonly ElementId[];
      readonly dxMm: number;
      readonly dyMm: number;
    }
  | {
      readonly kind: 'modify';
      readonly before: FloorElement;
      readonly after: FloorElement;
    }
  | {
      readonly kind: 'meta';
      readonly before: Partial<DocumentMeta>;
      readonly after: Partial<DocumentMeta>;
    };

/** Label for an undo menu entry. */
export function describeCommand(command: Command): string {
  switch (command.kind) {
    case 'insert':
      return `Add ${command.element.label || command.element.type}`;
    case 'remove':
      return `Delete ${command.element.label || command.element.type}`;
    case 'move':
      return command.ids.length === 1 ? 'Move' : `Move ${String(command.ids.length)} items`;
    case 'modify':
      return `Edit ${command.after.label || command.after.type}`;
    case 'meta':
      return 'Change plan details';
  }
}

export function applyCommand(doc: FlooredDocument, command: Command): FlooredDocument {
  switch (command.kind) {
    case 'insert':
      return insertElement(doc, command.element, command.index);

    case 'remove':
      return removeElement(doc, command.element.id);

    case 'move':
      return moveMany(doc, command.ids, command.dxMm, command.dyMm);

    case 'modify':
      return replaceElement(doc, command.after);

    case 'meta':
      return updateMeta(doc, command.after);
  }
}

export function invertCommand(command: Command): Command {
  switch (command.kind) {
    case 'insert':
      return { kind: 'remove', element: command.element, index: command.index };

    case 'remove':
      return { kind: 'insert', element: command.element, index: command.index };

    case 'move':
      return { kind: 'move', ids: command.ids, dxMm: -command.dxMm, dyMm: -command.dyMm };

    case 'modify':
      return { kind: 'modify', before: command.after, after: command.before };

    case 'meta':
      return { kind: 'meta', before: command.after, after: command.before };
  }
}

function moveMany(
  doc: FlooredDocument,
  ids: readonly ElementId[],
  dx: number,
  dy: number
): FlooredDocument {
  if (dx === 0 && dy === 0) return doc;
  const idSet = new Set(ids);
  return {
    ...doc,
    elements: doc.elements.map((e) => (idSet.has(e.id) ? moveElement(e, dx, dy) : e)),
  };
}

/** Build an insert that appends to the top of the draw order. */
export function addCommand(doc: FlooredDocument, element: FloorElement): Command {
  return { kind: 'insert', element, index: doc.elements.length };
}

/**
 * Build a removal, capturing the element and its draw-order index.
 *
 * Always construct removals through this rather than by hand: the index can
 * only be read *before* the removal, and it is what makes the undo faithful.
 *
 * Returns `null` when the element is not present, so a stale selection cannot
 * push a command that silently does nothing.
 */
export function removeCommand(doc: FlooredDocument, id: ElementId): Command | null {
  const element = findElement(doc, id);
  if (!element) return null;
  return { kind: 'remove', element, index: indexOfElement(doc, id) };
}

/**
 * Build a modification, capturing the current state as the `before`.
 *
 * Returns `null` when nothing actually changed, so a click that opens and
 * closes a property panel does not deposit a no-op on the undo stack.
 */
export function modifyCommand(doc: FlooredDocument, after: FloorElement): Command | null {
  const before = findElement(doc, after.id);
  if (!before) return null;
  if (JSON.stringify(before) === JSON.stringify(after)) return null;
  return { kind: 'modify', before, after };
}
