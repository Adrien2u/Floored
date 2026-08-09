/**
 * Align, distribute, duplicate, array.
 *
 * The operations that turn a rough placement into a drafted plan. All pure:
 * they read a document and a selection and return commands, so the undo stack
 * gets one entry per user action rather than one per element touched.
 */

import type { ElementId, FloorElement } from '$lib/document/element';
import { elementBounds, moveElement } from '$lib/document/element';
import type { FlooredDocument } from '$lib/document/document';
import type { Command } from '$lib/document/commands';
import type { Rect } from '$lib/geometry/transform';
import { selectedElements, editableIds } from './selection';

export type AlignEdge = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type DistributeAxis = 'horizontal' | 'vertical';

/**
 * Align the selection to one edge.
 *
 * The target is taken from the **selection's overall bounds**, not from a
 * designated "key" element. Aligning left moves everything to the leftmost
 * edge present, which is what users predict without being told which element
 * is the anchor.
 *
 * Fewer than two editable elements produces nothing: aligning one element to
 * itself is a no-op that would still land on the undo stack.
 */
export function alignCommands(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  edge: AlignEdge
): Command[] {
  const elements = selectedElements(doc, selection).filter((e) => !e.locked);
  if (elements.length < 2) return [];

  const boxes = elements.map((e) => ({ element: e, bounds: elementBounds(e) }));
  const overall = unionBounds(boxes.map((b) => b.bounds));

  const commands: Command[] = [];
  for (const { element, bounds } of boxes) {
    const { dx, dy } = offsetToEdge(bounds, overall, edge);
    if (dx === 0 && dy === 0) continue;
    commands.push({ kind: 'move', ids: [element.id], dxMm: dx, dyMm: dy });
  }
  return commands;
}

function offsetToEdge(bounds: Rect, overall: Rect, edge: AlignEdge): { dx: number; dy: number } {
  switch (edge) {
    case 'left':
      return { dx: overall.x - bounds.x, dy: 0 };
    case 'right':
      return { dx: overall.x + overall.width - (bounds.x + bounds.width), dy: 0 };
    case 'centerX':
      return {
        dx: Math.round(overall.x + overall.width / 2 - (bounds.x + bounds.width / 2)),
        dy: 0,
      };
    case 'top':
      return { dx: 0, dy: overall.y - bounds.y };
    case 'bottom':
      return { dx: 0, dy: overall.y + overall.height - (bounds.y + bounds.height) };
    case 'centerY':
      return {
        dx: 0,
        dy: Math.round(overall.y + overall.height / 2 - (bounds.y + bounds.height / 2)),
      };
  }
}

/**
 * Space the selection evenly between its outermost members.
 *
 * Distributes by **centre**, not by gap. Equal gaps between differently sized
 * objects look wrong on a floor plan, where a row of tables should read as
 * evenly spaced regardless of whether one of them is a 72-inch round.
 *
 * The first and last elements stay put — they define the span.
 */
export function distributeCommands(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  axis: DistributeAxis
): Command[] {
  const elements = selectedElements(doc, selection).filter((e) => !e.locked);
  if (elements.length < 3) return [];

  const horizontal = axis === 'horizontal';
  const boxes = elements
    .map((e) => ({ element: e, bounds: elementBounds(e) }))
    .map((b) => ({
      ...b,
      center: horizontal ? b.bounds.x + b.bounds.width / 2 : b.bounds.y + b.bounds.height / 2,
    }))
    .sort((a, b) => a.center - b.center);

  const first = boxes[0];
  const last = boxes[boxes.length - 1];
  if (!first || !last) return [];

  const span = last.center - first.center;
  if (span === 0) return [];

  const step = span / (boxes.length - 1);

  const commands: Command[] = [];
  for (let i = 1; i < boxes.length - 1; i++) {
    const box = boxes[i];
    if (!box) continue;

    const target = first.center + step * i;
    const delta = Math.round(target - box.center);
    if (delta === 0) continue;

    commands.push({
      kind: 'move',
      ids: [box.element.id],
      dxMm: horizontal ? delta : 0,
      dyMm: horizontal ? 0 : delta,
    });
  }
  return commands;
}

/** Supplies ids for copies. Injected so tests are deterministic. */
export type IdFactory = () => ElementId;

/**
 * Default id factory.
 *
 * `crypto.randomUUID` is available in every supported browser and in Node 19+.
 * Ids are opaque, so their shape carries no meaning and can change freely.
 */
export function defaultIdFactory(): ElementId {
  return crypto.randomUUID();
}

/**
 * Duplicate the selection, offset so the copies are visibly not the originals.
 *
 * Offsetting matters more than it sounds: a duplicate placed exactly on top of
 * its original looks like nothing happened, and the user duplicates again.
 */
export function duplicateCommands(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  offsetMm: { x: number; y: number },
  newId: IdFactory = defaultIdFactory
): Command[] {
  const elements = selectedElements(doc, selection);
  if (elements.length === 0) return [];

  const commands: Command[] = [];
  let index = doc.elements.length;

  for (const element of elements) {
    // The copy is placed on top of the draw order and is never locked, whatever
    // the original was — a copy the user cannot immediately move is a puzzle.
    const copy: FloorElement = {
      ...moveElement({ ...element, locked: false }, offsetMm.x, offsetMm.y),
      id: newId(),
    };
    commands.push({ kind: 'insert', element: copy, index });
    index += 1;
  }
  return commands;
}

/**
 * Repeat the selection on a grid.
 *
 * The workhorse for laying out a banquet room: place one table, then array it
 * five across and four down at the spacing the clearance rules want.
 *
 * The original counts as the first cell, so a 3 × 2 array of one table yields
 * five copies, not six.
 */
export function arrayCommands(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  columns: number,
  rows: number,
  spacingMm: { x: number; y: number },
  newId: IdFactory = defaultIdFactory
): Command[] {
  const elements = selectedElements(doc, selection);
  if (elements.length === 0) return [];
  if (columns < 1 || rows < 1) return [];
  if (columns === 1 && rows === 1) return [];

  const commands: Command[] = [];
  let index = doc.elements.length;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (row === 0 && col === 0) continue; // the originals

      for (const element of elements) {
        const copy: FloorElement = {
          ...moveElement({ ...element, locked: false }, col * spacingMm.x, row * spacingMm.y),
          id: newId(),
        };
        commands.push({ kind: 'insert', element: copy, index });
        index += 1;
      }
    }
  }
  return commands;
}

/** Delete the selection. Locked elements are skipped, not refused. */
export function deleteCommands(doc: FlooredDocument, selection: ReadonlySet<ElementId>): Command[] {
  const ids = new Set(editableIds(doc, selection));
  const commands: Command[] = [];

  // Reverse draw order, so each captured index is still valid when the commands
  // are applied in sequence. Removing front-to-back shifts everything after it.
  for (let i = doc.elements.length - 1; i >= 0; i--) {
    const element = doc.elements[i];
    if (!element || !ids.has(element.id)) continue;
    commands.push({ kind: 'remove', element, index: i });
  }
  return commands;
}

function unionBounds(rects: readonly Rect[]): Rect {
  const first = rects[0];
  if (!first) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = first.x;
  let minY = first.y;
  let maxX = first.x + first.width;
  let maxY = first.y + first.height;

  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.width > maxX) maxX = r.x + r.width;
    if (r.y + r.height > maxY) maxY = r.y + r.height;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
