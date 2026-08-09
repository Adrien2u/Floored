<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Renderer, type RenderState } from '$lib/render/renderer';
  import type { Palette } from '$lib/render/draw';
  import {
    panByPixels,
    zoomAt,
    resizeViewport,
    fitToBounds,
    screenToMm,
  } from '$lib/render/viewport';
  import { elementAt, elementsInMarquee } from '$lib/render/scene';
  import { documentBounds } from '$lib/document/document';
  import { DEFAULT_GRID_MM } from '$lib/geometry/snap';
  import { beginDrag, updateDrag, commitDrag, type DragState } from '$lib/tools/drag';
  import { clearanceIssues } from '$lib/catalog/capacity';
  import type { Rect } from '$lib/geometry/transform';
  import type { Editor } from './editor.svelte';

  interface Props {
    editor: Editor;
  }

  const { editor }: Props = $props();

  let host: HTMLDivElement;
  let staticCanvas: HTMLCanvasElement;
  let interactionCanvas: HTMLCanvasElement;
  let renderer: Renderer | null = null;

  /**
   * The pointer gesture currently in progress.
   *
   * One variable rather than several booleans: a pointer can only be doing one
   * thing at a time, and encoding that in the type removes every "is it panning
   * *and* dragging?" question before it can be asked.
   */
  type Gesture =
    | { kind: 'none' }
    | { kind: 'pan'; lastPx: { x: number; y: number } }
    | { kind: 'drag'; state: DragState }
    | { kind: 'marquee'; startMm: { x: number; y: number }; rect: Rect };

  let gesture = $state<Gesture>({ kind: 'none' });

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
    const marquee = gesture.kind === 'marquee' ? gesture.rect : undefined;
    // Recomputed per repaint rather than cached: at realistic plan sizes the
    // pairwise scan is well under a millisecond, and a cache that can go stale
    // would show a warning for a table the user already moved.
    const warnings = clearanceIssues(editor.document).map((issue) => ({
      atMm: issue.atMm,
      severity: issue.severity,
    }));

    return {
      document: editor.document,
      viewport: editor.viewport,
      selectedIds: editor.selection,
      hiddenLayers: editor.hiddenLayers,
      palette: readPalette(),
      gridSpacingMm: editor.gridMm || DEFAULT_GRID_MM,
      warnings,
      ...(marquee ? { marquee } : {}),
    };
  }

  function sizeCanvases() {
    const rect = host.getBoundingClientRect();
    // Render at device resolution so hairlines stay crisp on a high-DPI screen,
    // then scale the context back to CSS pixels so layout maths stays in one unit.
    const dpr = window.devicePixelRatio || 1;

    for (const canvas of [staticCanvas, interactionCanvas]) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width.toString()}px`;
      canvas.style.height = `${rect.height.toString()}px`;
      canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    editor.viewport = resizeViewport(editor.viewport, rect.width, rect.height);
  }

  function pointerMm(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    return screenToMm(event.clientX - rect.left, event.clientY - rect.top, editor.viewport);
  }

  function pointerPx(event: PointerEvent) {
    const rect = host.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  onMount(() => {
    const staticCtx = staticCanvas.getContext('2d');
    const interactionCtx = interactionCanvas.getContext('2d');
    if (!staticCtx || !interactionCtx) return;

    renderer = new Renderer(staticCtx, interactionCtx);
    sizeCanvases();
    editor.viewport = fitToBounds(editor.viewport, documentBounds(editor.document));
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
    void editor.document;
    void editor.viewport;
    void editor.selection;
    void editor.hiddenLayers;
    void gesture;
    renderer?.invalidate(currentState());
  });

  function onWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    // Exponential, so a trackpad's many small deltas and a mouse wheel's few
    // large ones zoom at the same perceived rate.
    editor.viewport = zoomAt(editor.viewport, Math.exp(-event.deltaY * 0.002), anchor);
  }

  function onPointerDown(event: PointerEvent) {
    interactionCanvas.setPointerCapture(event.pointerId);
    const mm = pointerMm(event);

    // Middle button or space-equivalent (shift) pans, whatever is underneath.
    if (event.button === 1 || event.shiftKey) {
      gesture = { kind: 'pan', lastPx: pointerPx(event) };
      return;
    }

    const hit = elementAt(editor.document, mm, editor.hiddenLayers);

    if (!hit) {
      if (!event.ctrlKey && !event.metaKey) editor.clearSelection();
      gesture = { kind: 'marquee', startMm: mm, rect: { x: mm.x, y: mm.y, width: 0, height: 0 } };
      return;
    }

    if (event.ctrlKey || event.metaKey) {
      editor.toggleSelection(hit.id);
      gesture = { kind: 'none' };
      return;
    }

    // Clicking an element that is already part of a multi-selection keeps the
    // selection, so dragging one member drags the group — the behaviour every
    // drawing tool has and nobody thinks about until it is missing.
    if (!editor.selection.has(hit.id)) editor.select(hit.id);

    const drag = beginDrag(editor.document, editor.selection, mm);
    gesture = drag ? { kind: 'drag', state: drag } : { kind: 'none' };
  }

  function onPointerMove(event: PointerEvent) {
    if (gesture.kind === 'none') return;
    const mm = pointerMm(event);

    switch (gesture.kind) {
      case 'pan': {
        const px = pointerPx(event);
        editor.viewport = panByPixels(
          editor.viewport,
          px.x - gesture.lastPx.x,
          px.y - gesture.lastPx.y
        );
        gesture = { kind: 'pan', lastPx: px };
        break;
      }

      case 'drag': {
        const next = updateDrag(gesture.state, editor.document, mm, {
          gridMm: editor.snapEnabled ? editor.gridMm : 0,
          scale: editor.viewport.scale,
          snapDisabled: event.altKey || !editor.snapEnabled,
        });
        gesture = { kind: 'drag', state: next };
        break;
      }

      case 'marquee': {
        gesture = {
          kind: 'marquee',
          startMm: gesture.startMm,
          rect: {
            x: Math.min(gesture.startMm.x, mm.x),
            y: Math.min(gesture.startMm.y, mm.y),
            width: Math.abs(mm.x - gesture.startMm.x),
            height: Math.abs(mm.y - gesture.startMm.y),
          },
        };
        break;
      }
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (interactionCanvas.hasPointerCapture(event.pointerId)) {
      interactionCanvas.releasePointerCapture(event.pointerId);
    }

    if (gesture.kind === 'drag') {
      editor.push(commitDrag(gesture.state));
    } else if (gesture.kind === 'marquee' && gesture.rect.width + gesture.rect.height > 0) {
      const ids = elementsInMarquee(editor.document, gesture.rect, editor.hiddenLayers);
      if (ids.length > 0) editor.selectMany(ids);
    }

    gesture = { kind: 'none' };
  }

  function onKeyDown(event: KeyboardEvent) {
    const mod = event.ctrlKey || event.metaKey;

    if (mod && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) editor.redo();
      else editor.undo();
      return;
    }

    if (mod && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      editor.selectAll();
      return;
    }

    if (mod && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      editor.duplicate();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      editor.deleteSelection();
      return;
    }

    if (event.key === 'Escape') {
      editor.clearSelection();
      return;
    }

    const arrows: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = arrows[event.key];
    if (direction) {
      event.preventDefault();
      editor.nudge(direction, event.shiftKey);
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

<div class="canvas-host" bind:this={host} data-testid="canvas-host">
  <canvas bind:this={staticCanvas} class="layer"></canvas>
  <canvas
    bind:this={interactionCanvas}
    class="layer interaction"
    class:panning={gesture.kind === 'pan'}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>

  <div class="hud">
    <button
      onclick={() => {
        editor.fit();
      }}>Fit</button
    >
    <span data-testid="selection-count">{editor.selection.size} selected</span>
    <span data-testid="element-count">{editor.document.elements.length} elements</span>
  </div>
</div>

<style>
  .canvas-host {
    position: relative;
    width: 100%;
    height: 68vh;
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

  .interaction.panning {
    cursor: grabbing;
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
