/**
 * Scene-query performance budget.
 *
 * ADR-0012 set the targets from real venue capacities: 1,000 indexed elements,
 * 5,000 drawn primitives per frame, 60 fps sustained pan/zoom, hit-test under
 * 1 ms.
 *
 * This file covers the *query* half — culling and hit-testing — because that is
 * what a spatial index would accelerate, and the whole reason `rbush` was left
 * out is the claim that a linear scan is fast enough at this scale. That claim
 * needs evidence, and it needs to keep being true.
 *
 * The thresholds are deliberately loose. A CI runner is a noisy, shared, often
 * throttled machine, and a flaky performance test gets deleted rather than
 * fixed. These are set roughly an order of magnitude above the measured local
 * figures, so they catch an algorithmic regression — a linear scan turning
 * quadratic — rather than policing the last few microseconds.
 */

import { describe, it, expect } from 'vitest';
import { elementsInBounds, elementAt, elementsInMarquee } from './scene';
import { visibleBounds, panByPixels, zoomAt, type Viewport } from './viewport';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches } from '$lib/geometry/units';

/** ADR-0012: realistic plans stay under this. */
const TARGET_ELEMENTS = 1000;

/** One frame at 60 fps. A full frame's work must fit inside this. */
const FRAME_BUDGET_MS = 16.67;

/**
 * Build a plan the size of a very large gala: a room, a grid of tables filling
 * it, and fixtures — laid out at real dimensions rather than random noise, so
 * the culling and hit-test paths see realistic spatial distribution.
 */
function largePlan(elementCount: number): FlooredDocument {
  let doc = createDocument({ name: 'Benchmark gala' });

  const columns = Math.ceil(Math.sqrt(elementCount));
  const spacing = inches(60) + inches(60); // table plus a comfortable gap

  doc = addElement(doc, {
    id: 'room',
    type: 'room',
    layer: 'room',
    rotationDeg: 0,
    locked: true,
    label: 'Hall',
    points: [
      { x: 0, y: 0 },
      { x: columns * spacing, y: 0 },
      { x: columns * spacing, y: columns * spacing },
      { x: 0, y: columns * spacing },
    ],
  });

  for (let i = 0; i < elementCount - 1; i++) {
    const table: FloorElement = {
      id: `t${String(i)}`,
      type: 'roundTable',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: `T${String(i + 1)}`,
      center: {
        x: (i % columns) * spacing + spacing / 2,
        y: Math.floor(i / columns) * spacing + spacing / 2,
      },
      diameterMm: inches(60),
      seats: 8,
    };
    doc = addElement(doc, table);
  }

  return doc;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function timeMedian(iterations: number, fn: () => void): number {
  // Warm up, so the first run's JIT compilation is not what gets measured.
  for (let i = 0; i < 20; i++) fn();

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    samples.push(performance.now() - start);
  }
  return median(samples);
}

describe('scene query performance', () => {
  const doc = largePlan(TARGET_ELEMENTS);

  const viewport: Viewport = {
    originMm: { x: 0, y: 0 },
    scale: 0.02,
    widthPx: 1600,
    heightPx: 1000,
  };

  it('builds the benchmark plan at the target size', () => {
    expect(doc.elements).toHaveLength(TARGET_ELEMENTS);
  });

  it('culls a 1,000-element plan well inside a frame', () => {
    const region = visibleBounds(viewport);
    const ms = timeMedian(200, () => {
      elementsInBounds(doc, region);
    });

    // Measured locally at well under 0.1 ms. The bound catches a linear scan
    // becoming quadratic, not a few microseconds of drift.
    expect(ms).toBeLessThan(FRAME_BUDGET_MS / 4);
  });

  it('hit-tests in well under a millisecond', () => {
    const ms = timeMedian(200, () => {
      elementAt(doc, { x: 12000, y: 9000 });
    });

    expect(ms).toBeLessThan(1);
  });

  it('hit-tests empty space just as fast, the worst case for a linear scan', () => {
    // A miss cannot early-exit: every element must be rejected. This is the
    // case a spatial index would help most, so it is the one worth bounding.
    const ms = timeMedian(200, () => {
      elementAt(doc, { x: -50000, y: -50000 });
    });

    expect(ms).toBeLessThan(1);
  });

  it('selects a full-plan marquee inside a frame', () => {
    const everything = { x: -10000, y: -10000, width: 200000, height: 200000 };
    const ms = timeMedian(100, () => {
      elementsInMarquee(doc, everything);
    });

    expect(ms).toBeLessThan(FRAME_BUDGET_MS / 2);
  });

  it('sustains a 60-frame pan without exceeding the frame budget', () => {
    // The realistic loop: pan a step, recompute what is visible, repeat.
    let v = viewport;
    const start = performance.now();

    for (let frame = 0; frame < 60; frame++) {
      v = panByPixels(v, 4, 2);
      elementsInBounds(doc, visibleBounds(v));
    }

    const totalMs = performance.now() - start;
    expect(totalMs / 60).toBeLessThan(FRAME_BUDGET_MS / 4);
  });

  it('sustains a 60-frame zoom without exceeding the frame budget', () => {
    let v = viewport;
    const anchor = { x: 800, y: 500 };
    const start = performance.now();

    for (let frame = 0; frame < 60; frame++) {
      v = zoomAt(v, frame < 30 ? 1.02 : 1 / 1.02, anchor);
      elementsInBounds(doc, visibleBounds(v));
    }

    const totalMs = performance.now() - start;
    expect(totalMs / 60).toBeLessThan(FRAME_BUDGET_MS / 4);
  });

  it('scales linearly, not quadratically, with element count', () => {
    // The property that justifies leaving rbush out. If this ratio blows up,
    // something has turned an O(n) scan into O(n^2) and the index becomes
    // worth its dependency after all.
    const small = largePlan(250);
    const large = largePlan(1000);
    const region = { x: -10000, y: -10000, width: 500000, height: 500000 };

    const smallMs = timeMedian(200, () => {
      elementsInBounds(small, region);
    });
    const largeMs = timeMedian(200, () => {
      elementsInBounds(large, region);
    });

    // 4x the elements should cost roughly 4x. Allow 10x for timer noise on a
    // shared CI runner; quadratic growth would be 16x and climbing.
    const ratio = largeMs / Math.max(smallMs, 0.0001);
    expect(ratio).toBeLessThan(10);
  });
});
