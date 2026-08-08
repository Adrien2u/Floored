import { describe, it, expect } from 'vitest';
import {
  createViewport,
  mmToScreen,
  screenToMm,
  lengthToScreen,
  panByPixels,
  zoomAt,
  resizeViewport,
  visibleBounds,
  fitToBounds,
  MIN_SCALE,
  MAX_SCALE,
} from './viewport';
import { feet } from '$lib/geometry/units';

const view = (scale = 0.1) => ({
  originMm: { x: 0, y: 0 },
  scale,
  widthPx: 800,
  heightPx: 600,
});

describe('projection', () => {
  it('maps the origin to the top-left corner', () => {
    expect(mmToScreen({ x: 0, y: 0 }, view())).toEqual({ x: 0, y: 0 });
  });

  it('scales millimetres to pixels', () => {
    expect(mmToScreen({ x: 1000, y: 500 }, view(0.1))).toEqual({ x: 100, y: 50 });
  });

  it('offsets by the pan origin', () => {
    const v = { ...view(0.1), originMm: { x: 1000, y: 0 } };
    expect(mmToScreen({ x: 1000, y: 0 }, v)).toEqual({ x: 0, y: 0 });
  });

  it('round-trips through the inverse, on the millimetre lattice', () => {
    const v = { ...view(0.1), originMm: { x: 250, y: -125 } };
    for (const point of [
      { x: 0, y: 0 },
      { x: 5000, y: 3000 },
      { x: -1200, y: 800 },
    ]) {
      const screen = mmToScreen(point, v);
      expect(screenToMm(screen.x, screen.y, v)).toEqual(point);
    }
  });

  it('scales bare lengths', () => {
    expect(lengthToScreen(1524, view(0.1))).toBeCloseTo(152.4, 6);
  });
});

describe('panning', () => {
  it('moves the document opposite the drag, as dragging the paper does', () => {
    // Dragging right by 100 px reveals content to the left.
    const panned = panByPixels(view(0.1), 100, 0);
    expect(panned.originMm.x).toBe(-1000);
  });

  it('leaves the scale alone', () => {
    expect(panByPixels(view(0.1), 50, 50).scale).toBe(0.1);
  });
});

describe('zooming', () => {
  it('keeps the document point under the cursor fixed', () => {
    const v = view(0.1);
    const anchor = { x: 400, y: 300 };
    const before = screenToMm(anchor.x, anchor.y, v);

    const zoomed = zoomAt(v, 2, anchor);
    const after = screenToMm(anchor.x, anchor.y, zoomed);

    // Within a millimetre — the origin is rounded to the lattice.
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1);
  });

  it('holds the anchor across a zoom in and back out', () => {
    const v = view(0.1);
    const anchor = { x: 123, y: 456 };
    const before = screenToMm(anchor.x, anchor.y, v);

    let z = v;
    for (let i = 0; i < 8; i++) z = zoomAt(z, 1.25, anchor);
    for (let i = 0; i < 8; i++) z = zoomAt(z, 1 / 1.25, anchor);

    const after = screenToMm(anchor.x, anchor.y, z);
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(2);
  });

  it('clamps to the zoom limits', () => {
    expect(zoomAt(view(MAX_SCALE), 10, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt(view(MIN_SCALE), 0.01, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
  });

  it('returns the same viewport when already clamped, so nothing re-renders', () => {
    const v = view(MAX_SCALE);
    expect(zoomAt(v, 2, { x: 0, y: 0 })).toBe(v);
  });
});

describe('visibleBounds', () => {
  it('describes the document rectangle on screen', () => {
    const b = visibleBounds(view(0.1));
    expect(b).toEqual({ x: 0, y: 0, width: 8000, height: 6000 });
  });

  it('shows less document as the scale grows', () => {
    expect(visibleBounds(view(0.2)).width).toBe(4000);
  });
});

describe('fitToBounds', () => {
  const room = { x: 0, y: 0, width: feet(60), height: feet(40) };

  it('fits a ballroom into the canvas', () => {
    const fitted = fitToBounds(view(), room);
    const visible = visibleBounds(fitted);

    expect(visible.width).toBeGreaterThanOrEqual(room.width);
    expect(visible.height).toBeGreaterThanOrEqual(room.height);
  });

  it('centres the content rather than pinning it to a corner', () => {
    const fitted = fitToBounds(view(), room);
    const visible = visibleBounds(fitted);

    const leftGap = room.x - visible.x;
    const rightGap = visible.x + visible.width - (room.x + room.width);
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(visible.width * 0.02);
  });

  it('leaves the viewport alone for an empty document', () => {
    const v = view();
    expect(fitToBounds(v, { x: 0, y: 0, width: 0, height: 0 })).toBe(v);
  });

  it('respects the zoom limits even for a tiny plan', () => {
    const fitted = fitToBounds(view(), { x: 0, y: 0, width: 10, height: 10 });
    expect(fitted.scale).toBeLessThanOrEqual(MAX_SCALE);
  });
});

describe('resize', () => {
  it('changes the canvas without moving the view', () => {
    const v = { ...view(0.1), originMm: { x: 500, y: 500 } };
    const resized = resizeViewport(v, 1200, 900);

    expect(resized.originMm).toEqual(v.originMm);
    expect(resized.scale).toBe(v.scale);
    expect(resized.widthPx).toBe(1200);
  });
});

describe('createViewport', () => {
  it('starts at the document origin', () => {
    const v = createViewport(800, 600);
    expect(v.originMm).toEqual({ x: 0, y: 0 });
    expect(v.scale).toBeGreaterThan(MIN_SCALE);
  });
});
