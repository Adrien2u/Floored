/**
 * The viewport — pan, zoom, and the screen projection.
 *
 * This module owns `mmToScreen`, the second and last of the two coordinate
 * projections the architecture permits (ADR-0006). The other is
 * `mmToPdfPoints`. A third would be a bug.
 *
 * Viewport state is deliberately **not** part of the document and **not**
 * undoable (ADR-0003): Ctrl+Z after moving a table moves the table back, it does
 * not restore a scroll position.
 */

import type { Point } from '$lib/geometry/vec';
import type { Rect } from '$lib/geometry/transform';

export interface Viewport {
  /** Document coordinate (mm) displayed at the top-left of the canvas. */
  readonly originMm: Point;
  /** Screen pixels per millimetre. */
  readonly scale: number;
  /** Canvas size in CSS pixels. */
  readonly widthPx: number;
  readonly heightPx: number;
}

/**
 * Zoom limits.
 *
 * The lower bound shows roughly a football pitch; the upper shows a few
 * centimetres. Outside that range the view is not useful and the maths starts
 * losing precision at the extremes.
 */
export const MIN_SCALE = 0.002;
export const MAX_SCALE = 2;

export function createViewport(widthPx: number, heightPx: number): Viewport {
  return { originMm: { x: 0, y: 0 }, scale: 0.05, widthPx, heightPx };
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Project a document point to canvas pixels. */
export function mmToScreen(point: Point, viewport: Viewport): { x: number; y: number } {
  return {
    x: (point.x - viewport.originMm.x) * viewport.scale,
    y: (point.y - viewport.originMm.y) * viewport.scale,
  };
}

/**
 * Project canvas pixels back to a document point, rounded to the millimetre.
 *
 * The inverse is what turns a pointer position into a place to put a table, so
 * it lands on the integer lattice like everything else (ADR-0006).
 */
export function screenToMm(px: number, py: number, viewport: Viewport): Point {
  return {
    x: Math.round(viewport.originMm.x + px / viewport.scale),
    y: Math.round(viewport.originMm.y + py / viewport.scale),
  };
}

/** Scale a length from millimetres to pixels. */
export function lengthToScreen(lengthMm: number, viewport: Viewport): number {
  return lengthMm * viewport.scale;
}

/** Move the view by a pixel delta — a drag of the canvas. */
export function panByPixels(viewport: Viewport, dxPx: number, dyPx: number): Viewport {
  return {
    ...viewport,
    originMm: {
      x: Math.round(viewport.originMm.x - dxPx / viewport.scale),
      y: Math.round(viewport.originMm.y - dyPx / viewport.scale),
    },
  };
}

/**
 * Zoom about a fixed point on screen.
 *
 * The document point under the cursor stays under the cursor — the behaviour
 * every map and drawing tool has, and the thing users notice instantly when it
 * is missing.
 */
export function zoomAt(viewport: Viewport, factor: number, anchorPx: Point): Viewport {
  const nextScale = clampScale(viewport.scale * factor);
  if (nextScale === viewport.scale) return viewport;

  // The document point under the anchor before the zoom must equal the document
  // point under it afterwards; solving for the new origin gives this.
  const anchorMm = screenToMm(anchorPx.x, anchorPx.y, viewport);
  return {
    ...viewport,
    scale: nextScale,
    originMm: {
      x: Math.round(anchorMm.x - anchorPx.x / nextScale),
      y: Math.round(anchorMm.y - anchorPx.y / nextScale),
    },
  };
}

/** Resize the canvas without moving the view. */
export function resizeViewport(viewport: Viewport, widthPx: number, heightPx: number): Viewport {
  return { ...viewport, widthPx, heightPx };
}

/** The document rectangle currently visible, in millimetres. */
export function visibleBounds(viewport: Viewport): Rect {
  return {
    x: viewport.originMm.x,
    y: viewport.originMm.y,
    width: Math.round(viewport.widthPx / viewport.scale),
    height: Math.round(viewport.heightPx / viewport.scale),
  };
}

/**
 * Fit a document rectangle into the canvas, with a margin.
 *
 * Used by "zoom to fit" and on opening a plan. An empty or zero-size rectangle
 * leaves the viewport alone rather than dividing by zero.
 */
export function fitToBounds(viewport: Viewport, bounds: Rect, marginPx = 40): Viewport {
  if (bounds.width <= 0 || bounds.height <= 0) return viewport;

  const usableWidth = Math.max(1, viewport.widthPx - marginPx * 2);
  const usableHeight = Math.max(1, viewport.heightPx - marginPx * 2);
  const scale = clampScale(Math.min(usableWidth / bounds.width, usableHeight / bounds.height));

  // Centre the content rather than pinning it to the top-left corner.
  const contentWidthPx = bounds.width * scale;
  const contentHeightPx = bounds.height * scale;
  const offsetXPx = (viewport.widthPx - contentWidthPx) / 2;
  const offsetYPx = (viewport.heightPx - contentHeightPx) / 2;

  return {
    ...viewport,
    scale,
    originMm: {
      x: Math.round(bounds.x - offsetXPx / scale),
      y: Math.round(bounds.y - offsetYPx / scale),
    },
  };
}
