/**
 * The rotate gesture.
 *
 * The one place ADR-0006's drift warning has teeth. Each update rotates the
 * element's **original** angle by the total swept angle — never the previous
 * frame's result by a small delta. Accumulating per frame walks an element
 * across the floor over a long drag, and it is the kind of bug that is invisible
 * until someone measures a printed plan.
 */

import type { ElementId, FloorElement } from '$lib/document/element';
import { rotateElement } from '$lib/document/element';
import type { FlooredDocument } from '$lib/document/document';
import { findElement } from '$lib/document/document';
import type { Command } from '$lib/document/commands';
import { modifyCommand } from '$lib/document/commands';
import type { Point } from '$lib/geometry/vec';
import { radToDeg, normalizeAngle } from '$lib/geometry/transform';
import { snapAngle } from '$lib/geometry/snap';

/** Angle step when snapping is on. Fifteen degrees divides evenly into 90 and 360. */
export const ROTATE_SNAP_DEGREES = 15;

export interface RotateState {
  readonly id: ElementId;
  /** Pivot, in document coordinates. */
  readonly pivotMm: Point;
  /** The element's rotation when the gesture began. */
  readonly startRotationDeg: number;
  /** Pointer angle when the gesture began. */
  readonly startPointerDeg: number;
  /** Current rotation, after snapping. */
  readonly rotationDeg: number;
}

export interface RotateOptions {
  /** Held modifier that suspends snapping — usually Alt. */
  readonly snapDisabled?: boolean;
  readonly stepDegrees?: number;
}

/**
 * Begin rotating a single element about a pivot.
 *
 * Returns `null` for a locked element or a room. A room's orientation lives in
 * its own vertices, so rotating it as a whole would be a different operation
 * with different semantics — not this one.
 */
export function beginRotate(
  doc: FlooredDocument,
  id: ElementId,
  pivotMm: Point,
  pointerMm: Point
): RotateState | null {
  const element = findElement(doc, id);
  if (!element || element.locked || element.type === 'room') return null;

  return {
    id,
    pivotMm,
    startRotationDeg: element.rotationDeg,
    startPointerDeg: angleOf(pivotMm, pointerMm),
    rotationDeg: element.rotationDeg,
  };
}

export function updateRotate(
  state: RotateState,
  pointerMm: Point,
  options: RotateOptions = {}
): RotateState {
  const swept = angleOf(state.pivotMm, pointerMm) - state.startPointerDeg;

  // Always derived from the starting angle, never from state.rotationDeg.
  const raw = normalizeAngle(state.startRotationDeg + swept);
  const step = options.stepDegrees ?? ROTATE_SNAP_DEGREES;
  const rotationDeg = options.snapDisabled ? raw : snapAngle(raw, step);

  return { ...state, rotationDeg };
}

/**
 * Finish the rotation.
 *
 * Returns `null` when the angle is unchanged — a click on the handle that does
 * not move should not land on the undo stack.
 */
export function commitRotate(state: RotateState, doc: FlooredDocument): Command | null {
  const element = findElement(doc, state.id);
  if (!element) return null;
  if (normalizeAngle(state.rotationDeg) === normalizeAngle(element.rotationDeg)) return null;

  return modifyCommand(doc, rotateElement(element, state.rotationDeg));
}

/** The element as it would look mid-gesture, for the preview overlay. */
export function previewElement(state: RotateState, doc: FlooredDocument): FloorElement | undefined {
  const element = findElement(doc, state.id);
  if (!element) return undefined;
  return rotateElement(element, state.rotationDeg);
}

/**
 * Rotate a selection by a fixed amount — the 90-degree buttons and shortcuts.
 *
 * Rooms and locked elements are skipped rather than refused, so rotating a mixed
 * selection turns what it can instead of doing nothing.
 */
export function rotateByCommands(
  doc: FlooredDocument,
  selection: ReadonlySet<ElementId>,
  degrees: number
): Command[] {
  const commands: Command[] = [];
  for (const element of doc.elements) {
    if (!selection.has(element.id)) continue;
    if (element.locked || element.type === 'room') continue;

    const rotated = rotateElement(element, element.rotationDeg + degrees);
    const command = modifyCommand(doc, rotated);
    if (command) commands.push(command);
  }
  return commands;
}

function angleOf(from: Point, to: Point): number {
  return radToDeg(Math.atan2(to.y - from.y, to.x - from.x));
}
