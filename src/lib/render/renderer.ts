/**
 * The dual-canvas renderer.
 *
 * Two stacked canvases (ADR-0001, pattern from Excalidraw):
 *
 * - **static** — the plan. Repaints only when the document or viewport changes.
 * - **interaction** — selection handles, snap guides, drag previews, marquee.
 *   Repaints freely; it is cheap and mostly empty.
 *
 * Dragging a table repaints the small interaction canvas per frame and the
 * static canvas once, on drop. Without the split, every pointer move would
 * repaint the whole world.
 *
 * Repaints are coalesced through `requestAnimationFrame`, so twenty state
 * changes in one tick cost one frame rather than twenty.
 */

import type { FlooredDocument } from '$lib/document/document';
import type { ElementId } from '$lib/document/element';
import { elementBounds } from '$lib/document/element';
import type { Viewport } from './viewport';
import { visibleBounds, mmToScreen, lengthToScreen } from './viewport';
import { elementsInBounds, padRect } from './scene';
import { drawElement, drawGrid, drawClearanceWarning, type Palette } from './draw';
import type { Rect } from '$lib/geometry/transform';
import type { Point } from '$lib/geometry/vec';

/** Extra margin around the viewport, so elements crossing the edge still draw. */
const CULL_PADDING_MM = 500;

/** Selection handle size, in screen pixels — handles do not scale with zoom. */
const HANDLE_PX = 7;

export interface RenderState {
  readonly document: FlooredDocument;
  readonly viewport: Viewport;
  readonly selectedIds: ReadonlySet<ElementId>;
  readonly hiddenLayers: ReadonlySet<string>;
  readonly palette: Palette;
  readonly gridSpacingMm: number;
  /** In-progress marquee, in document coordinates. */
  readonly marquee?: Rect;
  /**
   * Clearance problems to mark on the plan.
   *
   * Drawn on the interaction canvas rather than the static one: they are
   * derived from the document rather than part of it, and they change on every
   * edit, so keeping them off the static layer avoids a full repaint each time
   * a table moves a millimetre.
   */
  readonly warnings?: readonly {
    readonly atMm: Point;
    readonly severity: 'tight' | 'violation';
  }[];
}

/** Result of a static repaint, for the benchmark and for diagnostics. */
export interface RenderStats {
  readonly elementsConsidered: number;
  readonly elementsDrawn: number;
  readonly durationMs: number;
}

export class Renderer {
  private frame: number | null = null;
  private pendingStatic = false;
  private pendingInteraction = false;
  private state: RenderState | null = null;
  private lastStats: RenderStats | null = null;

  constructor(
    private readonly staticCtx: CanvasRenderingContext2D,
    private readonly interactionCtx: CanvasRenderingContext2D,
    private readonly schedule: (cb: () => void) => number = requestAnimationFrame,
    private readonly cancel: (handle: number) => void = cancelAnimationFrame
  ) {}

  /** Queue a full repaint: the document or viewport changed. */
  invalidate(state: RenderState): void {
    this.state = state;
    this.pendingStatic = true;
    this.pendingInteraction = true;
    this.requestFrame();
  }

  /**
   * Queue an overlay-only repaint: selection moved, marquee grew, guide appeared.
   *
   * This is the hot path during a drag, and it deliberately does not touch the
   * static canvas.
   */
  invalidateOverlay(state: RenderState): void {
    this.state = state;
    this.pendingInteraction = true;
    this.requestFrame();
  }

  /** Paint immediately, bypassing the frame queue. For tests and for export. */
  renderNow(state: RenderState): RenderStats {
    this.state = state;
    const stats = this.paintStatic(state);
    this.paintInteraction(state);
    this.lastStats = stats;
    return stats;
  }

  get stats(): RenderStats | null {
    return this.lastStats;
  }

  /** Cancel any queued frame. Call on teardown. */
  dispose(): void {
    if (this.frame !== null) this.cancel(this.frame);
    this.frame = null;
    this.pendingStatic = false;
    this.pendingInteraction = false;
  }

  private requestFrame(): void {
    if (this.frame !== null) return;
    this.frame = this.schedule(() => {
      this.frame = null;
      const state = this.state;
      if (!state) return;

      if (this.pendingStatic) {
        this.lastStats = this.paintStatic(state);
        this.pendingStatic = false;
      }
      if (this.pendingInteraction) {
        this.paintInteraction(state);
        this.pendingInteraction = false;
      }
    });
  }

  private paintStatic(state: RenderState): RenderStats {
    const start = performance.now();
    const { viewport, palette } = state;

    this.staticCtx.clearRect(0, 0, viewport.widthPx, viewport.heightPx);
    this.staticCtx.fillStyle = palette.panel;
    this.staticCtx.fillRect(0, 0, viewport.widthPx, viewport.heightPx);

    drawGrid(this.staticCtx, viewport, palette, state.gridSpacingMm);

    const region = padRect(visibleBounds(viewport), CULL_PADDING_MM);
    const visible = elementsInBounds(state.document, region, state.hiddenLayers);

    for (const element of visible) {
      drawElement(this.staticCtx, element, viewport, {
        palette,
        selectedIds: state.selectedIds,
      });
    }

    return {
      elementsConsidered: state.document.elements.length,
      elementsDrawn: visible.length,
      durationMs: performance.now() - start,
    };
  }

  private paintInteraction(state: RenderState): void {
    const { viewport, palette } = state;
    this.interactionCtx.clearRect(0, 0, viewport.widthPx, viewport.heightPx);

    for (const id of state.selectedIds) {
      const element = state.document.elements.find((e) => e.id === id);
      if (element) this.drawHandles(element.id, elementBounds(element), state);
    }

    if (state.marquee) this.drawMarquee(state.marquee, viewport, palette);

    for (const warning of state.warnings ?? []) {
      drawClearanceWarning(this.interactionCtx, warning.atMm, warning.severity, viewport, palette);
    }
  }

  private drawHandles(_id: ElementId, bounds: Rect, state: RenderState): void {
    const { viewport, palette } = state;
    const topLeft = mmToScreen({ x: bounds.x, y: bounds.y }, viewport);
    const widthPx = lengthToScreen(bounds.width, viewport);
    const heightPx = lengthToScreen(bounds.height, viewport);

    const ctx = this.interactionCtx;
    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(topLeft.x, topLeft.y, widthPx, heightPx);
    ctx.setLineDash([]);

    ctx.fillStyle = palette.surface;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ] as const) {
      const x = topLeft.x + dx * widthPx - HANDLE_PX / 2;
      const y = topLeft.y + dy * heightPx - HANDLE_PX / 2;
      ctx.fillRect(x, y, HANDLE_PX, HANDLE_PX);
      ctx.strokeRect(x, y, HANDLE_PX, HANDLE_PX);
    }
  }

  private drawMarquee(marquee: Rect, viewport: Viewport, palette: Palette): void {
    const topLeft = mmToScreen({ x: marquee.x, y: marquee.y }, viewport);
    const ctx = this.interactionCtx;

    ctx.strokeStyle = palette.accent;
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(
      topLeft.x,
      topLeft.y,
      lengthToScreen(marquee.width, viewport),
      lengthToScreen(marquee.height, viewport)
    );
    ctx.setLineDash([]);
  }
}
