/**
 * The undo stack.
 *
 * Holds only document-changing commands. Viewport pan and zoom, selection,
 * panel state, and the active tool are deliberately **not** undoable
 * (ADR-0003) — Ctrl+Z after moving a table must move the table back, not
 * restore a scroll position from four actions ago.
 *
 * The history is immutable, like everything else here: pushing returns a new
 * history rather than mutating one in place.
 */

import type { FlooredDocument } from './document';
import type { Command } from './commands';
import { applyCommand, invertCommand, describeCommand } from './commands';

/**
 * How many commands to retain.
 *
 * Commands are small — a move is two numbers and a list of ids — so this is
 * generous. It exists to bound memory on a long session, not to ration undo.
 */
export const HISTORY_LIMIT = 500;

export interface History {
  readonly past: readonly Command[];
  readonly future: readonly Command[];
}

export interface HistoryState {
  readonly document: FlooredDocument;
  readonly history: History;
}

export function createHistory(): History {
  return { past: [], future: [] };
}

export function canUndo(history: History): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History): boolean {
  return history.future.length > 0;
}

/** Label of the action Ctrl+Z would reverse, for menus and tooltips. */
export function undoLabel(history: History): string | null {
  const last = history.past[history.past.length - 1];
  return last ? describeCommand(last) : null;
}

export function redoLabel(history: History): string | null {
  const next = history.future[history.future.length - 1];
  return next ? describeCommand(next) : null;
}

/**
 * Apply a command and record it.
 *
 * Pushing clears the redo stack — the standard behaviour, and the only one that
 * is honest: once you branch off the timeline, the abandoned future no longer
 * applies to the document you now have.
 *
 * A `null` command is a no-op, so callers can pass the result of
 * `removeCommand` or `modifyCommand` straight through without a guard.
 */
export function push(state: HistoryState, command: Command | null): HistoryState {
  if (!command) return state;

  const past = [...state.history.past, command];
  return {
    document: applyCommand(state.document, command),
    history: {
      past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
      future: [],
    },
  };
}

export function undo(state: HistoryState): HistoryState {
  const command = state.history.past[state.history.past.length - 1];
  if (!command) return state;

  return {
    document: applyCommand(state.document, invertCommand(command)),
    history: {
      past: state.history.past.slice(0, -1),
      future: [...state.history.future, command],
    },
  };
}

export function redo(state: HistoryState): HistoryState {
  const command = state.history.future[state.history.future.length - 1];
  if (!command) return state;

  return {
    document: applyCommand(state.document, command),
    history: {
      past: [...state.history.past, command],
      future: state.history.future.slice(0, -1),
    },
  };
}

/**
 * Discard history without touching the document.
 *
 * Used after opening a file: the actions that built the previous plan are not
 * meaningful undo targets for the new one.
 */
export function clearHistory(state: HistoryState): HistoryState {
  return { document: state.document, history: createHistory() };
}
