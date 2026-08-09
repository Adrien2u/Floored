import { describe, it, expect } from 'vitest';
import { exportPlanSvg } from './plan-svg';
import { SCALE, mmToPdfPoints } from './projection';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';

const room: FloorElement = {
  id: 'room',
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: true,
  label: 'Ballroom',
  points: [
    { x: 0, y: 0 },
    { x: feet(60), y: 0 },
    { x: feet(60), y: feet(40) },
    { x: 0, y: feet(40) },
  ],
};

const table: FloorElement = {
  id: 't1',
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: 'T1',
  center: { x: feet(10), y: feet(10) },
  diameterMm: inches(60),
  seats: 8,
};

function ballroom(): FlooredDocument {
  let doc = createDocument({ name: 'Spring Gala' });
  doc = addElement(doc, room);
  doc = addElement(doc, table);
  return doc;
}

describe('structure', () => {
  it('emits a well-formed SVG document', () => {
    const svg = exportPlanSvg(ballroom());
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('carries the plan name as the document title', () => {
    expect(exportPlanSvg(ballroom())).toContain('<title>Spring Gala</title>');
  });

  it('records the scale it was drawn at', () => {
    const svg = exportPlanSvg(ballroom(), { scale: SCALE.imperial1_8 });
    expect(svg).toContain(`1/8&quot; = 1&#x27;-0&quot;`.replace('&#x27;', "'"));
  });
});

describe('true scale', () => {
  it('declares a physical size in millimetres, so printing at 100% measures right', () => {
    const svg = exportPlanSvg(ballroom(), { scale: SCALE.imperial1_8, marginMm: 0 });

    // 60 ft at 1/8" = 1'-0" is 7.5 inches = 190.5 mm on paper.
    const width = /width="([\d.]+)mm"/.exec(svg);
    expect(width).not.toBeNull();
    expect(Number(width?.[1])).toBeCloseTo(190.5, 1);
  });

  it('sets a viewBox in PDF points, matching the PDF export', () => {
    const svg = exportPlanSvg(ballroom(), { scale: SCALE.imperial1_8, marginMm: 0 });

    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(viewBox).not.toBeNull();
    // 540 points, the same figure the PDF ruler test asserts.
    expect(Number(viewBox?.[1])).toBeCloseTo(540, 1);
  });

  it('scales the room polygon to the same length as the PDF would', () => {
    const svg = exportPlanSvg(ballroom(), { scale: SCALE.imperial1_8, marginMm: 0 });

    const points = /<polygon points="([^"]+)"/.exec(svg);
    expect(points).not.toBeNull();

    const coords = (points?.[1] ?? '').split(' ').map((p) => p.split(',').map(Number));
    const xs = coords.map((c) => c[0] ?? 0);
    const span = Math.max(...xs) - Math.min(...xs);

    expect(span).toBeCloseTo(mmToPdfPoints(feet(60), SCALE.imperial1_8), 3);
  });
});

describe('elements', () => {
  it('draws the room as a polygon with a heavy stroke', () => {
    const svg = exportPlanSvg(ballroom());
    expect(svg).toContain('<polygon');
    expect(svg).toContain('stroke-width="1.2"');
  });

  it('draws a round table and its seats', () => {
    const svg = exportPlanSvg(ballroom(), { showSeats: true });
    // One table plus eight seats.
    expect((svg.match(/<circle/g) ?? []).length).toBe(9);
  });

  it('omits seats when asked', () => {
    const svg = exportPlanSvg(ballroom(), { showSeats: false });
    expect((svg.match(/<circle/g) ?? []).length).toBe(1);
  });

  it('labels tables', () => {
    expect(exportPlanSvg(ballroom())).toContain('>T1<');
  });

  it('rotates a rectangular element about its own centre', () => {
    let doc = createDocument();
    doc = addElement(doc, {
      id: 'r',
      type: 'rectTable',
      layer: 'furniture',
      rotationDeg: 45,
      locked: false,
      label: '',
      origin: { x: 0, y: 0 },
      widthMm: inches(96),
      depthMm: inches(30),
      seats: 8,
    });

    expect(exportPlanSvg(doc)).toMatch(/transform="rotate\(45 /);
  });

  it('does not emit a transform for an unrotated element', () => {
    let doc = createDocument();
    doc = addElement(doc, {
      id: 'f',
      type: 'fixture',
      layer: 'furniture',
      rotationDeg: 0,
      locked: false,
      label: 'Stage',
      kind: 'stage',
      origin: { x: 0, y: 0 },
      widthMm: feet(20),
      depthMm: feet(5),
    });

    expect(exportPlanSvg(doc)).not.toContain('transform=');
  });
});

describe('escaping', () => {
  it('escapes angle brackets, which would otherwise produce invalid XML', () => {
    const doc = createDocument({ name: 'Gala <2026> & friends' });
    const svg = exportPlanSvg(doc);

    expect(svg).toContain('Gala &lt;2026&gt; &amp; friends');
    expect(svg).not.toContain('<2026>');
  });

  it('escapes a note that contains markup', () => {
    let doc = createDocument();
    doc = addElement(doc, {
      id: 'n',
      type: 'note',
      layer: 'annotations',
      rotationDeg: 0,
      locked: false,
      label: '',
      origin: { x: 0, y: 0 },
      text: '<script>alert(1)</script>',
    });

    const svg = exportPlanSvg(doc);
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('empty documents', () => {
  it('exports without failing', () => {
    const svg = exportPlanSvg(createDocument());
    expect(svg).toContain('</svg>');
  });
});
