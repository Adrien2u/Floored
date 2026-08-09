/**
 * Editor state.
 *
 * Holds the document, the undo history, and the session state that is
 * deliberately *not* undoable — viewport, selection, active tool, layer
 * visibility (ADR-0003).
 *
 * Every document change goes through `push`, so there is exactly one place
 * where the history can be bypassed, and it is easy to see that nothing does.
 */

import { createDocument, documentBounds, type FlooredDocument } from '$lib/document/document';
import { addCommand, batch, type Command } from '$lib/document/commands';
import type { CatalogItem } from '$lib/catalog/catalog';
import {
  createHistory,
  push,
  undo,
  redo,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  type HistoryState,
} from '$lib/document/history';
import { prune, selectOnly, toggle, selectAll, type Selection } from '$lib/tools/selection';
import {
  alignCommands,
  distributeCommands,
  duplicateCommands,
  arrayCommands,
  deleteCommands,
  type AlignEdge,
  type DistributeAxis,
} from '$lib/tools/arrange';
import { nudgeCommand } from '$lib/tools/drag';
import { rotateByCommands } from '$lib/tools/rotate';
import { createViewport, fitToBounds, screenToMm, type Viewport } from '$lib/render/viewport';
import { DEFAULT_GRID_MM } from '$lib/geometry/snap';
import { inches } from '$lib/geometry/units';

/** Offset applied to duplicates, so a copy is visibly not its original. */
const DUPLICATE_OFFSET_MM = inches(12);

export class Editor {
  #state = $state<HistoryState>({
    document: createDocument(),
    history: createHistory(),
  });

  selection = $state<Selection>(new Set());
  viewport = $state<Viewport>(createViewport(800, 600));
  hiddenLayers = $state<ReadonlySet<string>>(new Set());
  gridMm = $state(DEFAULT_GRID_MM);
  snapEnabled = $state(true);

  constructor(initial?: FlooredDocument) {
    if (initial) this.#state = { document: initial, history: createHistory() };
  }

  get document(): FlooredDocument {
    return this.#state.document;
  }

  get canUndo(): boolean {
    return canUndo(this.#state.history);
  }

  get canRedo(): boolean {
    return canRedo(this.#state.history);
  }

  get undoLabel(): string | null {
    return undoLabel(this.#state.history);
  }

  get redoLabel(): string | null {
    return redoLabel(this.#state.history);
  }

  /**
   * Apply a command and record it.
   *
   * `null` is accepted and ignored, so callers can pass the result of a command
   * builder straight through — the builders return `null` for no-ops precisely
   * so a click that changes nothing never reaches the undo stack.
   */
  push(command: Command | null): void {
    if (!command) return;
    this.#state = push(this.#state, command);
    this.selection = prune(this.selection, this.#state.document);
  }

  /**
   * Apply several commands as a **single** undoable step.
   *
   * Aligning eight tables is one thing the user did, so Ctrl+Z must reverse all
   * of it at once. Pushing them individually would make undo feel broken in
   * exactly the way that is hard to describe and impossible to ignore.
   */
  pushBatch(label: string, commands: readonly Command[]): void {
    this.push(batch(label, commands));
  }

  undo(): void {
    this.#state = undo(this.#state);
    this.selection = prune(this.selection, this.#state.document);
  }

  redo(): void {
    this.#state = redo(this.#state);
    this.selection = prune(this.selection, this.#state.document);
  }

  select(id: string | null): void {
    this.selection = selectOnly(id);
  }

  toggleSelection(id: string): void {
    this.selection = toggle(this.selection, id);
  }

  selectMany(ids: readonly string[]): void {
    this.selection = new Set(ids);
  }

  selectAll(): void {
    this.selection = selectAll(this.document, this.hiddenLayers);
  }

  clearSelection(): void {
    this.selection = new Set();
  }

  toggleLayer(layer: string): void {
    const next = new Set(this.hiddenLayers);
    if (next.has(layer)) next.delete(layer);
    else next.add(layer);
    this.hiddenLayers = next;
    // A hidden element cannot be acted on, so it must not stay selected.
    this.selection = selectAll(this.document, next).size
      ? new Set([...this.selection].filter((id) => !this.#isHidden(id)))
      : new Set();
  }

  #isHidden(id: string): boolean {
    const element = this.document.elements.find((e) => e.id === id);
    return element ? this.hiddenLayers.has(element.layer) : true;
  }

  align(edge: AlignEdge): void {
    this.pushBatch(`Align ${edge}`, alignCommands(this.document, this.selection, edge));
  }

  distribute(axis: DistributeAxis): void {
    this.pushBatch(`Distribute ${axis}`, distributeCommands(this.document, this.selection, axis));
  }

  duplicate(): void {
    const commands = duplicateCommands(this.document, this.selection, {
      x: DUPLICATE_OFFSET_MM,
      y: DUPLICATE_OFFSET_MM,
    });
    this.pushBatch('Duplicate', commands);

    // Select the copies, which is what the user wants to move next.
    const newIds = commands.flatMap((c) => (c.kind === 'insert' ? [c.element.id] : []));
    if (newIds.length > 0) this.selectMany(newIds);
  }

  array(columns: number, rows: number, spacingMm: { x: number; y: number }): void {
    this.pushBatch(
      `Array ${String(columns)} × ${String(rows)}`,
      arrayCommands(this.document, this.selection, columns, rows, spacingMm)
    );
  }

  rotateBy(degrees: number): void {
    this.pushBatch(
      `Rotate ${String(degrees)}°`,
      rotateByCommands(this.document, this.selection, degrees)
    );
  }

  deleteSelection(): void {
    this.pushBatch('Delete', deleteCommands(this.document, this.selection));
    this.clearSelection();
  }

  nudge(direction: { x: number; y: number }, large = false): void {
    this.push(nudgeCommand(this.document, this.selection, direction, this.gridMm, large));
  }

  /**
   * Place a catalog item at the centre of the current view, and select it.
   *
   * Selecting the new element matters: the user's next action is almost always
   * to move it somewhere, and making them click what they just created is a
   * step the app can take for them.
   */
  placeCatalogItem(item: CatalogItem): void {
    const centre = screenToMm(this.viewport.widthPx / 2, this.viewport.heightPx / 2, this.viewport);

    const element = item.create(crypto.randomUUID(), centre);
    this.push(addCommand(this.document, element));
    this.select(element.id);
  }

  fit(): void {
    this.viewport = fitToBounds(this.viewport, documentBounds(this.document));
  }
}
