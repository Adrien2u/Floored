/**
 * Drawing elements onto a 2D context.
 *
 * Pure in the sense that matters: it reads the document and writes to a context,
 * holding no state of its own. That is what lets the same element definitions
 * feed the screen and the PDF exporter without either owning the geometry.
 *
 * Chairs are generated here, never stored (ADR-0012). A ten-seat table is one
 * element and eleven shapes.
 */

import type { FloorElement } from '$lib/document/element';
import type { Viewport } from './viewport';
import { mmToScreen, lengthToScreen } from './viewport';
import { seatPositions } from './scene';
import { rectCenter } from '$lib/geometry/transform';

/** Colours are supplied by the UI layer so the canvas follows the theme. */
export interface Palette {
  readonly ink: string;
  readonly muted: string;
  readonly surface: string;
  readonly panel: string;
  readonly accent: string;
  readonly warn: string;
  readonly grid: string;
}

/**
 * Below this many pixels, a chair is a smudge. Drawing it costs a full frame's
 * worth of arcs across a large plan and shows the user nothing, so it is
 * skipped — the single most effective optimisation in the renderer.
 */
const MIN_CHAIR_PX = 3;

/** Below this, labels are unreadable and are skipped for the same reason. */
const MIN_LABEL_PX = 28;

/** Chair radius in millimetres. */
const CHAIR_RADIUS_MM = 210;

export interface DrawOptions {
  readonly palette: Palette;
  readonly selectedIds?: ReadonlySet<string>;
}

/** Draw one element. Callers handle culling and ordering. */
export function drawElement(
  ctx: CanvasRenderingContext2D,
  element: FloorElement,
  viewport: Viewport,
  options: DrawOptions
): void {
  const { palette } = options;
  const selected = options.selectedIds?.has(element.id) ?? false;

  ctx.strokeStyle = selected ? palette.accent : palette.ink;
  ctx.fillStyle = palette.surface;
  ctx.lineWidth = selected ? 2 : 1;

  switch (element.type) {
    case 'room':
      drawRoom(ctx, element, viewport, palette);
      break;
    case 'roundTable':
      drawRoundTable(ctx, element, viewport, palette, selected);
      break;
    case 'rectTable':
      drawRotatedBox(
        ctx,
        element.origin,
        element.widthMm,
        element.depthMm,
        element.rotationDeg,
        viewport,
        palette.surface
      );
      break;
    case 'fixture':
      drawRotatedBox(
        ctx,
        element.origin,
        element.widthMm,
        element.depthMm,
        element.rotationDeg,
        viewport,
        palette.panel
      );
      break;
    case 'note':
      drawNote(ctx, element, viewport, palette);
      break;
  }
}

function drawRoom(
  ctx: CanvasRenderingContext2D,
  element: Extract<FloorElement, { type: 'room' }>,
  viewport: Viewport,
  palette: Palette
): void {
  const [first, ...rest] = element.points;
  if (!first) return;

  ctx.beginPath();
  const start = mmToScreen(first, viewport);
  ctx.moveTo(start.x, start.y);
  for (const point of rest) {
    const p = mmToScreen(point, viewport);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();

  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawRoundTable(
  ctx: CanvasRenderingContext2D,
  element: Extract<FloorElement, { type: 'roundTable' }>,
  viewport: Viewport,
  palette: Palette,
  selected: boolean
): void {
  const center = mmToScreen(element.center, viewport);
  const radiusPx = lengthToScreen(element.diameterMm / 2, viewport);

  const chairRadiusPx = lengthToScreen(CHAIR_RADIUS_MM, viewport);
  if (chairRadiusPx >= MIN_CHAIR_PX) {
    ctx.fillStyle = palette.surface;
    ctx.strokeStyle = palette.muted;
    ctx.lineWidth = 1;
    for (const seat of seatPositions(
      element.center,
      element.diameterMm,
      element.seats,
      element.rotationDeg
    )) {
      const s = mmToScreen(seat, viewport);
      ctx.beginPath();
      ctx.arc(s.x, s.y, chairRadiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.fillStyle = palette.surface;
  ctx.fill();
  ctx.strokeStyle = selected ? palette.accent : palette.ink;
  ctx.lineWidth = selected ? 2 : 1;
  ctx.stroke();

  if (radiusPx * 2 >= MIN_LABEL_PX && element.label !== '') {
    drawCenteredLabel(ctx, element.label, center, radiusPx, palette);
  }
}

function drawRotatedBox(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  widthMm: number,
  depthMm: number,
  rotationDeg: number,
  viewport: Viewport,
  fill: string
): void {
  const rect = { x: origin.x, y: origin.y, width: widthMm, height: depthMm };
  const center = mmToScreen(rectCenter(rect), viewport);
  const widthPx = lengthToScreen(widthMm, viewport);
  const depthPx = lengthToScreen(depthMm, viewport);

  ctx.save();
  // Rotating the context beats transforming four corners by hand, and keeps
  // stroke width uniform along every edge.
  ctx.translate(center.x, center.y);
  if (rotationDeg !== 0) ctx.rotate((rotationDeg * Math.PI) / 180);
  ctx.beginPath();
  ctx.rect(-widthPx / 2, -depthPx / 2, widthPx, depthPx);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawNote(
  ctx: CanvasRenderingContext2D,
  element: Extract<FloorElement, { type: 'note' }>,
  viewport: Viewport,
  palette: Palette
): void {
  const p = mmToScreen(element.origin, viewport);
  ctx.fillStyle = palette.muted;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(element.text, p.x, p.y);
}

function drawCenteredLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  center: { x: number; y: number },
  radiusPx: number,
  palette: Palette
): void {
  const size = Math.min(14, Math.max(8, radiusPx * 0.4));
  ctx.fillStyle = palette.ink;
  ctx.font = `600 ${String(Math.round(size))}px ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, center.x, center.y);
}

/**
 * Draw the background grid.
 *
 * Spacing adapts so the grid stays legible at any zoom: below a few pixels the
 * lines merge into a wash, and drawing thousands of them is pure cost.
 */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  palette: Palette,
  baseSpacingMm: number
): void {
  let spacingMm = baseSpacingMm;
  while (lengthToScreen(spacingMm, viewport) < 8) spacingMm *= 2;

  const spacingPx = lengthToScreen(spacingMm, viewport);
  if (spacingPx < 8) return;

  const startX = Math.floor(viewport.originMm.x / spacingMm) * spacingMm;
  const startY = Math.floor(viewport.originMm.y / spacingMm) * spacingMm;

  ctx.beginPath();
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;

  for (let x = startX; ; x += spacingMm) {
    const px = mmToScreen({ x, y: 0 }, viewport).x;
    if (px > viewport.widthPx) break;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, viewport.heightPx);
  }

  for (let y = startY; ; y += spacingMm) {
    const py = mmToScreen({ x: 0, y }, viewport).y;
    if (py > viewport.heightPx) break;
    ctx.moveTo(0, py);
    ctx.lineTo(viewport.widthPx, py);
  }

  ctx.stroke();
}

/**
 * How many primitives an element contributes at this zoom.
 *
 * Used by the benchmark to assert the drawn-primitive budget from ADR-0012,
 * and by nothing else — it is a measurement, not a rendering decision.
 */
export function primitiveCount(element: FloorElement, viewport: Viewport): number {
  if (element.type !== 'roundTable') return 1;
  const chairsVisible = lengthToScreen(CHAIR_RADIUS_MM, viewport) >= MIN_CHAIR_PX;
  return 1 + (chairsVisible ? element.seats : 0);
}
