import { describe, it, expect, vi } from 'vitest';
import { Renderer, type RenderState } from './renderer';
import { primitiveCount } from './draw';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import type { Viewport } from './viewport';
import { inches } from '$lib/geometry/units';

/**
 * A recording fake 2D context.
 *
 * Counts calls rather than producing pixels, which is what the interesting
 * assertions are about: whether the static canvas repainted at all, and how many
 * shapes were drawn. A headless browser would be slower and would tell us less.
 */
function fakeContext() {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.length.toString()})`);
    };

  const ctx = {
    calls,
    count: (name: string) => calls.filter((c) => c.startsWith(`${name}(`)).length,
    reset: () => {
      calls.length = 0;
    },
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    strokeRect: record('strokeRect'),
    beginPath: record('beginPath'),
    closePath: record('closePath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    arc: record('arc'),
    rect: record('rect'),
    fill: record('fill'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    save: record('save'),
    restore: record('restore'),
    translate: record('translate'),
    rotate: record('rotate'),
    setLineDash: record('setLineDash'),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: '' as CanvasTextAlign,
    textBaseline: '' as CanvasTextBaseline,
  };

  return ctx;
}

type FakeContext = ReturnType<typeof fakeContext>;

const palette = {
  ink: '#000',
  muted: '#666',
  surface: '#fff',
  panel: '#eee',
  accent: '#00f',
  warn: '#f80',
  grid: '#ddd',
};

const viewport: Viewport = {
  originMm: { x: 0, y: 0 },
  scale: 0.05,
  widthPx: 800,
  heightPx: 600,
};

const table = (id: string, x: number, y: number, seats = 8): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id,
  center: { x, y },
  diameterMm: inches(60),
  seats,
});

function planWith(count: number): FlooredDocument {
  let doc = createDocument();
  for (let i = 0; i < count; i++) {
    doc = addElement(
      doc,
      table(`t${String(i)}`, (i % 10) * 2000 + 1000, Math.floor(i / 10) * 2000 + 1000)
    );
  }
  return doc;
}

function state(doc: FlooredDocument, overrides: Partial<RenderState> = {}): RenderState {
  return {
    document: doc,
    viewport,
    selectedIds: new Set(),
    hiddenLayers: new Set(),
    palette,
    gridSpacingMm: inches(6),
    ...overrides,
  };
}

function makeRenderer(): {
  renderer: Renderer;
  staticCtx: FakeContext;
  interactionCtx: FakeContext;
  runFrame: () => void;
} {
  const staticCtx = fakeContext();
  const interactionCtx = fakeContext();

  let queued: (() => void) | null = null;
  const schedule = (cb: () => void): number => {
    queued = cb;
    return 1;
  };
  const cancel = (): void => {
    queued = null;
  };

  const renderer = new Renderer(
    staticCtx as unknown as CanvasRenderingContext2D,
    interactionCtx as unknown as CanvasRenderingContext2D,
    schedule,
    cancel
  );

  return {
    renderer,
    staticCtx,
    interactionCtx,
    runFrame: () => {
      const cb = queued;
      queued = null;
      cb?.();
    },
  };
}

describe('the dual-canvas split', () => {
  // This is the whole point of ADR-0001's renderer design: pointer movement
  // must not repaint the world.

  it('repaints only the interaction canvas for an overlay change', () => {
    const { renderer, staticCtx, interactionCtx, runFrame } = makeRenderer();
    const doc = planWith(20);

    renderer.invalidate(state(doc));
    runFrame();
    staticCtx.reset();
    interactionCtx.reset();

    renderer.invalidateOverlay(state(doc, { selectedIds: new Set(['t1']) }));
    runFrame();

    expect(staticCtx.count('clearRect')).toBe(0);
    expect(interactionCtx.count('clearRect')).toBe(1);
  });

  it('repaints both canvases for a document change', () => {
    const { renderer, staticCtx, interactionCtx, runFrame } = makeRenderer();

    renderer.invalidate(state(planWith(5)));
    runFrame();

    expect(staticCtx.count('clearRect')).toBe(1);
    expect(interactionCtx.count('clearRect')).toBe(1);
  });

  it('costs one frame for a drag of sixty overlay updates', () => {
    // A one-second drag at 60 fps must not repaint the plan sixty times.
    const { renderer, staticCtx, runFrame } = makeRenderer();
    const doc = planWith(100);

    renderer.invalidate(state(doc));
    runFrame();
    staticCtx.reset();

    for (let i = 0; i < 60; i++) {
      renderer.invalidateOverlay(state(doc, { selectedIds: new Set(['t1']) }));
      runFrame();
    }

    expect(staticCtx.count('clearRect')).toBe(0);
  });
});

describe('frame coalescing', () => {
  it('collapses many invalidations in one tick into a single repaint', () => {
    const { renderer, staticCtx, runFrame } = makeRenderer();
    const doc = planWith(10);

    for (let i = 0; i < 20; i++) renderer.invalidate(state(doc));
    runFrame();

    expect(staticCtx.count('clearRect')).toBe(1);
  });

  it('does not schedule a second frame while one is pending', () => {
    const schedule = vi.fn().mockReturnValue(1);
    const renderer = new Renderer(
      fakeContext() as unknown as CanvasRenderingContext2D,
      fakeContext() as unknown as CanvasRenderingContext2D,
      schedule,
      () => undefined
    );

    const doc = planWith(3);
    renderer.invalidate(state(doc));
    renderer.invalidate(state(doc));
    renderer.invalidateOverlay(state(doc));

    expect(schedule).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending frame on dispose', () => {
    const cancel = vi.fn();
    const renderer = new Renderer(
      fakeContext() as unknown as CanvasRenderingContext2D,
      fakeContext() as unknown as CanvasRenderingContext2D,
      () => 42,
      cancel
    );

    renderer.invalidate(state(planWith(1)));
    renderer.dispose();

    expect(cancel).toHaveBeenCalledWith(42);
  });
});

describe('culling', () => {
  it('draws only what is on screen', () => {
    const { renderer } = makeRenderer();

    let doc = createDocument();
    doc = addElement(doc, table('near', 1000, 1000));
    // Far outside a viewport showing 16 x 12 metres.
    doc = addElement(doc, table('far', 500000, 500000));

    const stats = renderer.renderNow(state(doc));

    expect(stats.elementsConsidered).toBe(2);
    expect(stats.elementsDrawn).toBe(1);
  });

  it('skips hidden layers', () => {
    const { renderer } = makeRenderer();
    const stats = renderer.renderNow(state(planWith(10), { hiddenLayers: new Set(['furniture']) }));
    expect(stats.elementsDrawn).toBe(0);
  });
});

describe('selection overlay', () => {
  it('draws a handle set for each selected element', () => {
    const { renderer, interactionCtx } = makeRenderer();
    const doc = planWith(5);

    renderer.renderNow(state(doc, { selectedIds: new Set(['t0', 't1']) }));

    // One dashed bounds box plus four handles per element.
    expect(interactionCtx.count('strokeRect')).toBe(2 * 5);
  });

  it('draws nothing when nothing is selected', () => {
    const { renderer, interactionCtx } = makeRenderer();
    renderer.renderNow(state(planWith(5)));
    expect(interactionCtx.count('strokeRect')).toBe(0);
  });

  it('draws the marquee on the interaction canvas', () => {
    const { renderer, interactionCtx, staticCtx } = makeRenderer();
    const doc = planWith(3);

    staticCtx.reset();
    renderer.renderNow(state(doc, { marquee: { x: 0, y: 0, width: 5000, height: 5000 } }));

    expect(interactionCtx.count('strokeRect')).toBe(1);
  });
});

describe('primitive budget', () => {
  it('counts a table plus its generated chairs', () => {
    expect(primitiveCount(table('t', 0, 0, 10), viewport)).toBe(11);
  });

  it('drops chairs when they are too small to see', () => {
    // Zoomed far out, a chair is under a pixel. Drawing thousands of invisible
    // arcs is the difference between 60 fps and a slideshow.
    const tiny: Viewport = { ...viewport, scale: 0.002 };
    expect(primitiveCount(table('t', 0, 0, 10), tiny)).toBe(1);
  });

  it('stays inside the 5,000-primitive budget for a large gala', () => {
    // ADR-0012: ~190 elements and ~1,450 primitives for 1,250 guests.
    let doc = createDocument();
    for (let i = 0; i < 156; i++) {
      doc = addElement(doc, table(`t${String(i)}`, (i % 13) * 2000, Math.floor(i / 13) * 2000, 8));
    }

    const total = doc.elements.reduce((sum, e) => sum + primitiveCount(e, viewport), 0);
    expect(total).toBeLessThan(5000);
    expect(total).toBe(156 * 9);
  });
});

describe('stats', () => {
  it('reports timing and counts after a paint', () => {
    const { renderer } = makeRenderer();
    const stats = renderer.renderNow(state(planWith(50)));

    expect(stats.elementsConsidered).toBe(50);
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(renderer.stats).toEqual(stats);
  });

  it('has no stats before the first paint', () => {
    expect(makeRenderer().renderer.stats).toBeNull();
  });
});
