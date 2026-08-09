/**
 * Selection.
 *
 * Selection is session state, not document state, and is deliberately not
 * undoable (ADR-0003). It lives here as pure set operations so the rules —
 * what shift-click does, what happens when a selected element is deleted — are
 * testable without a pointer or a canvas.
 */

import type { ElementId } from '$lib/document/element';
import type { FlooredDocument } from '$lib/document/document';

export type Selection = ReadonlySet<ElementId>;

export const EMPTY_SELECTION: Selection = new Set<ElementId>();

/** Replace the selection with a single element, or clear it. */
export function selectOnly(id: ElementId | null): Selection {
  return id === null ? new Set() : new Set([id]);
}

/**
 * Toggle an element in or out — shift-click, or ctrl-click.
 *
 * Toggling rather than only adding is what lets a user correct a mis-click
 * inside a multi-select without starting the whole selection over.
 */
export function toggle(selection: Selection, id: ElementId): Selection {
  const next = new Set(selection);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function add(selection: Selection, ids: readonly ElementId[]): Selection {
  const next = new Set(selection);
  for (const id of ids) next.add(id);
  return next;
}

export function remove(selection: Selection, ids: readonly ElementId[]): Selection {
  const next = new Set(selection);
  for (const id of ids) next.delete(id);
  return next;
}

export function selectAll(doc: FlooredDocument, hiddenLayers: ReadonlySet<string>): Selection {
  const next = new Set<ElementId>();
  for (const element of doc.elements) {
    // Selecting something invisible produces handles floating over nothing and
    // a delete the user cannot see the effect of.
    if (hiddenLayers.has(element.layer)) continue;
    next.add(element.id);
  }
  return next;
}

/**
 * Drop ids that are no longer in the document.
 *
 * Run after any document change. Undoing an add, or opening a different plan,
 * otherwise leaves the selection pointing at elements that do not exist, and
 * every consumer has to defend against it individually.
 */
export function prune(selection: Selection, doc: FlooredDocument): Selection {
  const present = new Set(doc.elements.map((e) => e.id));
  const next = new Set<ElementId>();
  for (const id of selection) if (present.has(id)) next.add(id);
  return next;
}

/** The selected elements, in draw order rather than selection order. */
export function selectedElements(doc: FlooredDocument, selection: Selection) {
  return doc.elements.filter((e) => selection.has(e.id));
}

/**
 * Can this selection be edited?
 *
 * A locked element is selectable — the user needs to see what it is and unlock
 * it — but not movable. A selection of only locked elements has nothing to act
 * on, and offering enabled controls that silently do nothing is worse than
 * disabling them.
 */
export function hasEditableElements(doc: FlooredDocument, selection: Selection): boolean {
  return selectedElements(doc, selection).some((e) => !e.locked);
}

/** Ids of the editable elements in the selection, in draw order. */
export function editableIds(doc: FlooredDocument, selection: Selection): ElementId[] {
  return selectedElements(doc, selection)
    .filter((e) => !e.locked)
    .map((e) => e.id);
}
