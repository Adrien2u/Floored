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
  import { seatCount } from '$lib/document/element';
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

  /**
   * The plan, in words.
   *
   * Names what is on the drawing and what is selected, because the canvas
   * itself is opaque to anything that is not looking at it.
   */
  const planSummary = $derived.by(() => {
    const total = editor.document.elements.length;
    const seats = editor.document.elements.reduce((sum, e) => sum + seatCount(e), 0);

    const parts = [
      total === 0
        ? 'Empty plan.'
        : `${String(total)} ${total === 1 ? 'element' : 'elements'}, ${String(seats)} seats.`,
    ];

    const selected = [...editor.selection]
      .map((id) => editor.document.elements.find((e) => e.id === id))
      .filter((e) => e !== undefined);

    if (selected.length === 1 && selected[0]) {
      const one = selected[0];
      parts.push(`Selected: ${one.label === '' ? one.type : one.label}.`);
    } else if (selected.length > 1) {
      parts.push(`${String(selected.length)} selected.`);
    } else {
      parts.push('Nothing selected.');
    }

    return parts.join(' ');
  });

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
    | { kind: 'marquee'; startMm: { x: number; y: number }; rect: Rect }
    | { kind: 'pinch'; distance: number; centrePx: { x: number; y: number } };

  let gesture = $state<Gesture>({ kind: 'none' });

  /**
   * Every pointer currently down, by id.
   *
   * Needed for pinch: a two-finger gesture is two independent pointers, and
   * neither event knows about the other. Without this the app could not be
   * zoomed on a tablet at all — there is no wheel and no keyboard, and a plan
   * you cannot zoom is a plan you cannot check.
   */
  const activePointers = new Map<number, { x: number; y: number }>();

  function pinchOf(): { distance: number; centrePx: { x: number; y: number } } | null {
    const [a, b] = [...activePointers.values()];
    if (!a || !b) return null;

    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      centrePx: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  }

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

    // Pointer movement and release are tracked on the window, added
    // imperatively.
    //
    // A captured pointer retargets its events to the canvas but they still
    // bubble to the window, so one listener covers both the captured and
    // uncaptured cases — which is what makes this work across all three
    // engines. Handling moves on the canvas alone depended on capture, and
    // capture is exactly what Firefox gets wrong.
    //
    // Imperative rather than `<svelte:window onpointermove=...>`: the
    // declarative form did not attach here, while `onkeydown` on the same
    // element did. Not worth chasing when addEventListener is unambiguous.
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('mouseup', endGesture);

    return () => {
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('mouseup', endGesture);
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

  /**
   * Take pointer capture, but only for gestures that need it.
   *
   * Capture routes later moves and the release to this canvas even when the
   * pointer leaves it — which happens constantly when dropping a table near an
   * edge, or panning past the frame. A marquee never leaves the canvas, so it
   * gains nothing from capture.
   *
   * That distinction matters because Firefox processes capture lazily: the
   * capture only takes effect on the *next* pointer event, and its pointer-out
   * handling during capture is a known defect (Bugzilla 1666851, 1151152).
   * Capturing on a gesture that did not need it cost the marquee its moves in
   * Firefox while working in Chromium and WebKit.
   */
  function capturePointer(event: PointerEvent) {
    try {
      interactionCanvas.setPointerCapture(event.pointerId);
    } catch {
      // A pointer that has already been released cannot be captured. Not worth
      // failing a gesture over.
    }
  }

  function onPointerDown(event: PointerEvent) {
    activePointers.set(event.pointerId, pointerPx(event));

    // A second finger turns whatever was happening into a pinch. Abandoning the
    // first gesture rather than committing it is deliberate: the user was
    // reaching to zoom, not choosing to move a table two millimetres.
    if (activePointers.size === 2) {
      const pinch = pinchOf();
      if (pinch) {
        gesture = { kind: 'pinch', ...pinch };
        return;
      }
    }

    capturePointer(event);
    const mm = pointerMm(event);

    // Middle button or space-equivalent (shift) pans, whatever is underneath.
    if (event.button === 1 || event.shiftKey) {
      gesture = { kind: 'pan', lastPx: pointerPx(event) };
      return;
    }

    const hit = elementAt(editor.document, mm, editor.hiddenLayers);

    // A guest picked up in the panel is placed by clicking a table. This is the
    // single-pointer alternative WCAG 2.5.7 requires for every drag operation,
    // and it is checked before selection so the click means "place", not
    // "select something else".
    if (editor.pendingGuest && hit && seatCount(hit) > 0) {
      editor.placeGuestAt(hit.id);
      editor.select(hit.id);
      gesture = { kind: 'none' };
      return;
    }

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
    if (drag) {
      gesture = { kind: 'drag', state: drag };
      return;
    }

    // Nothing movable under the pointer — a locked element, and in practice
    // almost always the room, which covers the whole canvas. Falling through to
    // a marquee is what makes dragging across the floor select the tables on
    // it; without this, a drag anywhere inside the room did nothing at all.
    gesture = { kind: 'marquee', startMm: mm, rect: { x: mm.x, y: mm.y, width: 0, height: 0 } };
  }

  /**
   * Pointer events already processed.
   *
   * A captured pointer is delivered to the canvas *and* bubbles to the window,
   * so both listeners see the same event and it must only be applied once.
   *
   * Keyed on the event object rather than its timestamp: several moves can
   * share a millisecond, and a timestamp-based guard silently discarded real
   * movement — which showed up as a marquee that tracked only part of the drag.
   * A WeakSet lets the entries be collected with the events themselves.
   */
  const handled = new WeakSet<Event>();

  function onPointerMove(event: PointerEvent) {
    if (handled.has(event)) return;
    handled.add(event);

    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, pointerPx(event));
    }

    if (gesture.kind === 'pinch') {
      const pinch = pinchOf();
      // Both the spread and the drift of the midpoint are applied, so a pinch
      // that wanders across the screen pans as well as zooms — which is what
      // two fingers on a map do everywhere else.
      if (pinch && pinch.distance > 0 && gesture.distance > 0) {
        editor.viewport = panByPixels(
          editor.viewport,
          pinch.centrePx.x - gesture.centrePx.x,
          pinch.centrePx.y - gesture.centrePx.y
        );
        editor.viewport = zoomAt(
          editor.viewport,
          pinch.distance / gesture.distance,
          pinch.centrePx
        );
        gesture = { kind: 'pinch', ...pinch };
      }
      return;
    }

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
    activePointers.delete(event.pointerId);

    if (interactionCanvas.hasPointerCapture(event.pointerId)) {
      interactionCanvas.releasePointerCapture(event.pointerId);
    }

    // Lifting one finger of a pinch leaves the other resting on the plan. Ending
    // the gesture rather than falling back to a pan stops the plan lurching
    // under a finger the user thought they had finished with.
    if (gesture.kind === 'pinch') {
      gesture = { kind: 'none' };
      return;
    }

    if (gesture.kind === 'none') return;
    endGesture();
  }

  /**
   * Finish whatever gesture is in progress.
   *
   * Separated from the pointer handler because it also has to be reachable
   * from `mouseup`. Firefox does not reliably deliver `pointerup` for a
   * captured pointer — moves arrive, the release does not — which left a
   * marquee stuck open forever and selecting nothing. Mouse events are
   * delivered consistently in every engine, so they serve as the safety net.
   *
   * Idempotent: whichever event arrives first ends the gesture, and the other
   * finds nothing to do.
   */
  function endGesture() {
    if (gesture.kind === 'drag') {
      editor.push(commitDrag(gesture.state));
    } else if (gesture.kind === 'marquee' && gesture.rect.width + gesture.rect.height > 0) {
      const ids = elementsInMarquee(editor.document, gesture.rect, editor.hiddenLayers);
      if (ids.length > 0) editor.selectMany(ids);
    }

    gesture = { kind: 'none' };
  }

  /**
   * Allow a guest dragged from the panel to be dropped on a table.
   *
   * `preventDefault` on dragover is what marks the canvas as a drop target;
   * without it the drop never fires and the interaction silently does nothing.
   */
  function onDragOver(event: DragEvent) {
    if (event.dataTransfer?.types.includes('text/floored-guest')) event.preventDefault();
  }

  function onDrop(event: DragEvent) {
    const guestId = event.dataTransfer?.getData('text/floored-guest');
    if (!guestId) return;
    event.preventDefault();

    const rect = host.getBoundingClientRect();
    const mm = screenToMm(event.clientX - rect.left, event.clientY - rect.top, editor.viewport);

    const hit = elementAt(editor.document, mm, editor.hiddenLayers);
    if (!hit || seatCount(hit) === 0) return;

    editor.pendingGuest = guestId;
    editor.placeGuestAt(hit.id);
    editor.select(hit.id);
  }

  /**
   * True when the keystroke belongs to something the user is typing into.
   *
   * Without this, searching the guest list for "Adam" and pressing Backspace to
   * fix a typo deleted the selected tables instead — the shortcuts are bound to
   * the window, and a text field never got the chance to say the key was
   * already spoken for.
   */
  function isTyping(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;

    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  function onKeyDown(event: KeyboardEvent) {
    if (isTyping(event.target)) return;

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

    // Stepping through elements is the keyboard equivalent of clicking one.
    // Without it the canvas is reachable but inert: nudge and delete both need
    // a selection, and every other way of making one needs a pointer.
    if (event.key === ']' || event.key === '[') {
      event.preventDefault();
      editor.stepSelection(event.key === ']' ? 1 : -1);
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

<!--
  A canvas editor is an application widget, and an application widget has to be
  focusable or the keyboard cannot reach it at all. The rule this suppresses is
  aimed at decorative elements given a tab stop by accident; here the tab stop
  is the point, and the commands it exposes are named in the label.
-->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="canvas-host"
  bind:this={host}
  id="plan"
  tabindex="0"
  role="application"
  aria-label="Floor plan. Bracket keys step through elements, arrow keys move the selection, Delete removes it."
  aria-describedby="plan-summary"
  data-testid="canvas-host"
  data-gesture={gesture.kind}
  data-scale={editor.viewport.scale}
  data-rect={gesture.kind === 'marquee' ? `${gesture.rect.width}x${gesture.rect.height}` : '-'}
>
  <!--
    The static layer is tagged so PNG export can find it without the parent
    having to thread a reference down and back. Only this layer: the
    interaction canvas holds selection handles and snap guides, which belong to
    editing rather than to the plan.
  -->
  <canvas bind:this={staticCanvas} class="layer" data-plan-layer="static"></canvas>
  <canvas
    bind:this={interactionCanvas}
    class="layer interaction"
    class:panning={gesture.kind === 'pan'}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondragover={onDragOver}
    ondrop={onDrop}
    onlostpointercapture={endGesture}
  ></canvas>

  <!--
    The drawing is pixels, and pixels say nothing to a screen reader. This is
    the same information in words: what the plan holds, and what is selected
    right now. It is not a replacement for seeing the layout — no honest text
    is — but it makes the state of the editor audible, which is what the
    keyboard commands act on. See docs/ACCESSIBILITY.md.
  -->
  <p id="plan-summary" class="sr-only" data-testid="plan-summary" aria-live="polite">
    {planSummary}
  </p>

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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .canvas-host:focus-visible {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }

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
