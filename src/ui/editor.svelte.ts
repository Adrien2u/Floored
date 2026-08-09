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
import { addCommand, batch, modifyCommand, type Command } from '$lib/document/commands';
import { seatCount } from '$lib/document/element';
import type { CatalogItem } from '$lib/catalog/catalog';
import {
  createSeatingPlan,
  seatGuest,
  unseatGuest,
  clearTable,
  guestsAt,
  pruneAssignments,
  type SeatingPlan,
  type Guest,
} from '$lib/seating/guest';
import { autoAssign, type AssignResult, type TableCapacity } from '$lib/seating/assign';
import { numberingLabels, type NumberingOptions } from '$lib/seating/numbering';

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

/** Seating changes retained for undo. Small: they are cheap and rarely deep. */
const SEATING_HISTORY_LIMIT = 100;

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

  /**
   * Guests, groups, and seat assignments.
   *
   * Held beside the document rather than inside it: guests have no geometry,
   * so the renderer, the spatial scan, and the undo stack have no business
   * reasoning about them (ADR-0013).
   */
  seating = $state<SeatingPlan>(createSeatingPlan());

  /**
   * The guest picked up but not yet placed.
   *
   * This is the click-to-place half of the interaction, and it is not optional:
   * WCAG 2.5.7 (Level AA, new in 2.2) requires every dragging function to have
   * a single-pointer alternative. Select a guest, click a seat.
   */
  pendingGuest = $state<string | null>(null);

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

  /**
   * Replace the document — opening a file.
   *
   * History is discarded rather than carried over: the actions that built the
   * previous plan are not meaningful undo targets for this one, and letting
   * Ctrl+Z reach back into a different document would be alarming.
   */
  load(doc: FlooredDocument, seating?: SeatingPlan): void {
    this.#state = { document: doc, history: createHistory() };
    this.seating = seating ?? createSeatingPlan();
    this.#seatingHistory = [];
    this.pendingGuest = null;
    this.clearSelection();
    this.hiddenLayers = new Set();
    this.fit();
  }

  /* ---------------------------------------------------------------- *
   * Seating
   *
   * Seating changes do not go through the document's undo stack: they are a
   * different kind of state, and mixing them would make Ctrl+Z after moving a
   * table sometimes unseat a guest instead. Seating has its own small history.
   * ---------------------------------------------------------------- */

  #seatingHistory = $state<SeatingPlan[]>([]);

  get canUndoSeating(): boolean {
    return this.#seatingHistory.length > 0;
  }

  #recordSeating(next: SeatingPlan): void {
    if (next === this.seating) return;
    this.#seatingHistory = [...this.#seatingHistory.slice(-SEATING_HISTORY_LIMIT), this.seating];
    this.seating = next;
  }

  undoSeating(): void {
    const previous = this.#seatingHistory[this.#seatingHistory.length - 1];
    if (!previous) return;
    this.#seatingHistory = this.#seatingHistory.slice(0, -1);
    this.seating = previous;
  }

  setSeating(plan: SeatingPlan): void {
    this.#recordSeating(plan);
  }

  /** Seats a table offers, for the assigner and for pruning. */
  seatCapacities(): Map<string, number> {
    const capacities = new Map<string, number>();
    for (const element of this.document.elements) {
      const seats = seatCount(element);
      if (seats > 0) capacities.set(element.id, seats);
    }
    return capacities;
  }

  tableCapacities(): TableCapacity[] {
    return [...this.seatCapacities()].map(([elementId, seats]) => ({ elementId, seats }));
  }

  /** Pick a guest up, or put them down again by picking the same one twice. */
  pickUpGuest(guestId: string): void {
    this.pendingGuest = this.pendingGuest === guestId ? null : guestId;
  }

  /**
   * Place the picked-up guest at a table, in the first free seat.
   *
   * Seat-precise placement is available by dropping onto a specific chair; this
   * is the forgiving version, and the one a keyboard or single-pointer user
   * gets.
   */
  placeGuestAt(elementId: string): void {
    const guestId = this.pendingGuest;
    if (!guestId) return;

    const capacity = this.seatCapacities().get(elementId) ?? 0;
    const taken = new Set(guestsAt(this.seating, elementId).map((g) => g.seat?.seatIndex));

    for (let index = 0; index < capacity; index++) {
      if (taken.has(index)) continue;
      this.#recordSeating(seatGuest(this.seating, guestId, { elementId, seatIndex: index }));
      this.pendingGuest = null;
      return;
    }

    // Full table: say nothing here, the panel reports it. Keeping the guest in
    // hand is kinder than dropping them silently.
  }

  seatGuestAt(guestId: string, elementId: string, seatIndex: number): void {
    this.#recordSeating(seatGuest(this.seating, guestId, { elementId, seatIndex }));
    this.pendingGuest = null;
  }

  unseatGuest(guestId: string): void {
    this.#recordSeating(unseatGuest(this.seating, guestId));
  }

  clearTable(elementId: string): void {
    this.#recordSeating(clearTable(this.seating, elementId));
  }

  autoAssign(): AssignResult {
    const result = autoAssign(this.seating, this.tableCapacities());
    this.#recordSeating(result.plan);
    return result;
  }

  toggleAssignmentLock(): void {
    this.#recordSeating({ ...this.seating, assignmentsLocked: !this.seating.assignmentsLocked });
  }

  /**
   * Drop assignments whose seat stopped existing.
   *
   * Called after the plan's tables change. Returns who was orphaned so the UI
   * can say so — a guest who quietly loses their seat is worse than one who was
   * never seated.
   */
  pruneSeating(): Guest[] {
    const { plan, orphaned } = pruneAssignments(this.seating, this.seatCapacities());
    if (orphaned.length > 0) this.#recordSeating(plan);
    return orphaned;
  }

  /** Apply a numbering scheme. Labels only — no guest moves (ADR-0013). */
  applyNumbering(options: NumberingOptions): void {
    const labels = numberingLabels(this.document, options);
    const commands: Command[] = [];

    for (const element of this.document.elements) {
      const label = labels.get(element.id);
      if (label === undefined || element.label === label) continue;
      const command = modifyCommand(this.document, { ...element, label });
      if (command) commands.push(command);
    }

    this.pushBatch('Number tables', commands);
  }

  fit(): void {
    this.viewport = fitToBounds(this.viewport, documentBounds(this.document));
  }
}
