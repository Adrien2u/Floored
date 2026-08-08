<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Renderer, type RenderState } from '$lib/render/renderer';
  import type { Palette } from '$lib/render/draw';
  import {
    createViewport,
    panByPixels,
    zoomAt,
    resizeViewport,
    fitToBounds,
    screenToMm,
    type Viewport,
  } from '$lib/render/viewport';
  import { elementAt } from '$lib/render/scene';
  import { documentBounds, type FlooredDocument } from '$lib/document/document';
  import { DEFAULT_GRID_MM } from '$lib/geometry/snap';

  interface Props {
    document: FlooredDocument;
  }

  const { document: plan }: Props = $props();

  let host: HTMLDivElement;
  let staticCanvas: HTMLCanvasElement;
  let interactionCanvas: HTMLCanvasElement;

  let renderer: Renderer | null = null;
  let viewport = $state<Viewport>(createViewport(800, 600));
  let selectedIds = $state<ReadonlySet<string>>(new Set());
  let panning = false;
  let lastPointer = { x: 0, y: 0 };

  /**
   * Read the palette from CSS custom properties so the canvas follows the
   * page theme. Canvas cannot inherit colour the way the DOM does, so the
   * values are pulled once per repaint rather than hard-coded.
   */
  function readPalette(): Palette {
    const style = getComputedStyle(host);
    const read = (name: string, fallback: string) =>
      style.getPropertyValue(name).trim() || fallback;

    return {
      ink: read('--color-text', '#16181d'),
      muted: read('--color-muted', '#5c6270'),
      surface: read('--color-surface', '#ffffff'),
      panel: read('--color-panel', '#eef1f5'),
      accent: read('--color-accent', '#2e5aac'),
      warn: read('--color-warn', '#b45309'),
      grid: read('--color-grid', '#e8edf3'),
    };
  }

  function currentState(): RenderState {
    return {
      document: plan,
      viewport,
      selectedIds,
      hiddenLayers: new Set(),
      palette: readPalette(),
      gridSpacingMm: DEFAULT_GRID_MM,
    };
  }

  function sizeCanvases() {
    const rect = host.getBoundingClientRect();
    // Render at device resolution so hairlines stay crisp on a high-DPI screen,
    // then scale the context back to CSS pixels so all the layout maths stays
    // in one unit.
    const dpr = window.devicePixelRatio || 1;

    for (const canvas of [staticCanvas, interactionCanvas]) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width.toString()}px`;
      canvas.style.height = `${rect.height.toString()}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    viewport = resizeViewport(viewport, rect.width, rect.height);
  }

  onMount(() => {
    const staticCtx = staticCanvas.getContext('2d');
    const interactionCtx = interactionCanvas.getContext('2d');
    if (!staticCtx || !interactionCtx) return;

    renderer = new Renderer(staticCtx, interactionCtx);
    sizeCanvases();
    viewport = fitToBounds(viewport, documentBounds(plan));
    renderer.invalidate(currentState());

    const observer = new ResizeObserver(() => {
      sizeCanvases();
      renderer?.invalidate(currentState());
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
    };
  });

  onDestroy(() => {
    renderer?.dispose();
  });

  $effect(() => {
    // Re-reads plan, viewport, and selection, so any change repaints.
    void plan;
    void viewport;
    void selectedIds;
    renderer?.invalidate(currentState());
  });

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // A trackpad reports many small deltas; an exponential keeps the zoom rate
    // even across both input kinds.
    viewport = zoomAt(viewport, Math.exp(-event.deltaY * 0.002), anchor);
  }

  function onPointerDown(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    // Middle button, space, or an empty-space drag pans. Phase 4 replaces this
    // with real tools; it exists so the renderer can be judged in motion.
    if (event.button === 1 || event.shiftKey) {
      panning = true;
      lastPointer = { x: px, y: py };
      interactionCanvas.setPointerCapture(event.pointerId);
      return;
    }

    const hit = elementAt(plan, screenToMm(px, py, viewport));
    selectedIds = hit ? new Set([hit.id]) : new Set();
  }

  function onPointerMove(event: PointerEvent) {
    if (!panning) return;
    const rect = host.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;

    viewport = panByPixels(viewport, px - lastPointer.x, py - lastPointer.y);
    lastPointer = { x: px, y: py };
  }

  function onPointerUp(event: PointerEvent) {
    if (!panning) return;
    panning = false;
    interactionCanvas.releasePointerCapture(event.pointerId);
  }

  function fit() {
    viewport = fitToBounds(viewport, documentBounds(plan));
  }
</script>

<div class="canvas-host" bind:this={host}>
  <canvas bind:this={staticCanvas} class="layer"></canvas>
  <canvas
    bind:this={interactionCanvas}
    class="layer interaction"
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>

  <div class="hud">
    <button onclick={fit}>Fit</button>
    <span>{Math.round(viewport.scale * 1000) / 10} px/cm</span>
    <span>{plan.elements.length} elements</span>
    <span>{selectedIds.size ? [...selectedIds][0] : 'nothing selected'}</span>
  </div>
</div>

<style>
  .canvas-host {
    position: relative;
    width: 100%;
    height: 70vh;
    min-height: 420px;
    border: 1px solid var(--color-line);
    border-radius: 8px;
    overflow: hidden;
    background: var(--color-panel, #eef1f5);
  }

  .layer {
    position: absolute;
    inset: 0;
    display: block;
  }

  .interaction {
    touch-action: none;
    cursor: crosshair;
  }

  .hud {
    position: absolute;
    left: 0.5rem;
    bottom: 0.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.3rem 0.6rem;
    border: 1px solid var(--color-line);
    border-radius: 6px;
    background: var(--color-surface);
    font-family: ui-monospace, monospace;
    font-size: 0.6875rem;
    color: var(--color-muted);
  }

  .hud button {
    font: inherit;
    padding: 0.15rem 0.5rem;
    border: 1px solid var(--color-line);
    border-radius: 4px;
    background: none;
    color: inherit;
    cursor: pointer;
  }

  .hud button:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
</style>
