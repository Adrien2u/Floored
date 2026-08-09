/**
 * Exporting a whole plan.
 *
 * The Phase 1 ruler test proved the projection with a synthetic line. This
 * proves it end to end: a real document, exported the way a user would export
 * it, measured back off the emitted file.
 */

import { describe, it, expect } from 'vitest';
import { exportPlanPdf } from './plan-pdf';
import { extractLines, extractText, countPages } from './minimal-pdf';
import { PAGE, SCALE, pdfPointsToMm } from './projection';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { inches, feet } from '$lib/geometry/units';

const room = (widthFeet: number, depthFeet: number): FloorElement => ({
  id: 'room',
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: true,
  label: 'Ballroom',
  points: [
    { x: 0, y: 0 },
    { x: feet(widthFeet), y: 0 },
    { x: feet(widthFeet), y: feet(depthFeet) },
    { x: 0, y: feet(depthFeet) },
  ],
});

const table = (id: string, x: number, y: number): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 0,
  locked: false,
  label: id.toUpperCase(),
  center: { x, y },
  diameterMm: inches(60),
  seats: 8,
});

function ballroom(): FlooredDocument {
  let doc = createDocument({ name: 'Spring Gala', eventDate: '2026-05-16' });
  doc = addElement(doc, room(60, 40));
  doc = addElement(doc, table('t1', feet(10), feet(10)));
  doc = addElement(doc, table('t2', feet(25), feet(10)));
  return doc;
}

/**
 * Lines belonging to the plan, excluding the title block's horizontal rule.
 *
 * The rule spans the full drawable width and would otherwise be the longest
 * line on every sheet — which quietly made an early version of these tests
 * measure the title block instead of a wall.
 */
function planLines(pdf: string, page = PAGE.letterLandscape) {
  const ruleY = page.marginPt + 54;
  return extractLines(pdf).filter((l) => !(l.y1 === l.y2 && Math.abs(l.y1 - ruleY) < 0.01));
}

describe('the ruler test, on a real exported plan', () => {
  // If this fails, the product's central promise is broken. Do not adjust a
  // tolerance to make it pass.

  it('draws the room walls at the true scaled length', () => {
    const doc = createDocument();
    const result = exportPlanPdf(addElement(doc, room(60, 40)), {
      page: PAGE.letterLandscape,
      scale: SCALE.imperial1_8,
      showSeats: false,
    });

    const lines = planLines(result.pdf);
    // Four walls.
    expect(lines).toHaveLength(4);

    const longest = Math.max(...lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1)));

    // 60 ft at 1/8" = 1'-0" is 7.5 inches on paper, which is 540 points.
    expect(longest).toBeCloseTo(540, 3);
    // And measured with a scale rule, that wall reads 60 feet.
    expect(pdfPointsToMm(longest, SCALE.imperial1_8)).toBeCloseTo(feet(60), 1);
  });

  it('holds true at a different scale', () => {
    const result = exportPlanPdf(addElement(createDocument(), room(20, 15)), {
      page: PAGE.letterLandscape,
      scale: SCALE.imperial1_4,
      showSeats: false,
    });

    const lines = planLines(result.pdf);
    const longest = Math.max(...lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1)));

    // 20 ft at 1/4" = 1'-0" is 5 inches = 360 points.
    expect(longest).toBeCloseTo(360, 3);
  });

  it('holds true in metric', () => {
    const result = exportPlanPdf(addElement(createDocument(), room(60, 40)), {
      page: PAGE.letterLandscape,
      scale: SCALE.metric1_100,
      showSeats: false,
    });

    const lines = planLines(result.pdf);
    const longest = Math.max(...lines.map((l) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1)));

    // 18288 mm at 1:100 is 182.88 mm on paper = 518.3 points.
    expect(pdfPointsToMm(longest, SCALE.metric1_100)).toBeCloseTo(feet(60), 1);
  });
});

describe('scale selection', () => {
  it('picks a standard scale that fits the sheet', () => {
    const result = exportPlanPdf(ballroom());
    expect(result.scale).toBe(SCALE.imperial1_8);
    expect(result.pages).toBe(1);
    expect(result.tiled).toBe(false);
  });

  it('honours an explicitly requested scale', () => {
    const result = exportPlanPdf(ballroom(), { scale: SCALE.imperial1_4 });
    expect(result.scale).toBe(SCALE.imperial1_4);
  });

  it('follows the document unit system when choosing', () => {
    const doc = { ...ballroom(), meta: { ...ballroom().meta, unitSystem: 'metric' as const } };
    expect(exportPlanPdf(doc).scale).toBe(SCALE.metric1_100);
  });
});

describe('tiling', () => {
  it('splits a plan too large for one sheet', () => {
    // A hall far bigger than a letter sheet at the requested scale.
    const hall = addElement(createDocument(), room(200, 120));
    const result = exportPlanPdf(hall, {
      page: PAGE.letterLandscape,
      scale: SCALE.imperial1_4,
      showSeats: false,
    });

    expect(result.tiled).toBe(true);
    expect(result.pages).toBeGreaterThan(1);
    expect(countPages(result.pdf)).toBe(result.pages);
  });

  it('numbers each sheet of the set', () => {
    const hall = addElement(createDocument(), room(200, 120));
    const result = exportPlanPdf(hall, {
      page: PAGE.letterLandscape,
      scale: SCALE.imperial1_4,
      showSeats: false,
    });

    const text = extractText(result.pdf);
    expect(text.some((t) => /^1 of \d+$/.test(t))).toBe(true);
    expect(text.some((t) => /^2 of \d+$/.test(t))).toBe(true);
  });

  it('keeps every sheet at the same scale, so the set measures consistently', () => {
    const hall = addElement(createDocument(), room(200, 120));
    const result = exportPlanPdf(hall, {
      page: PAGE.letterLandscape,
      scale: SCALE.imperial1_4,
      showSeats: false,
    });

    const scaleLabels = extractText(result.pdf).filter((t) => t.includes('='));
    expect(new Set(scaleLabels).size).toBe(1);
  });

  it('does not tile a plan that fits', () => {
    expect(exportPlanPdf(ballroom()).tiled).toBe(false);
  });
});

describe('the title block', () => {
  it('names the event', () => {
    const text = extractText(exportPlanPdf(ballroom()).pdf);
    expect(text).toContain('Spring Gala');
  });

  it('states the scale — without it, a to-scale drawing is unmeasurable', () => {
    const text = extractText(exportPlanPdf(ballroom(), { scale: SCALE.imperial1_8 }).pdf);
    expect(text).toContain('1/8" = 1\'-0"');
  });

  it('reports the seat total', () => {
    const text = extractText(exportPlanPdf(ballroom()).pdf);
    expect(text).toContain('16');
  });

  it('gives the room extent in the document units', () => {
    const text = extractText(exportPlanPdf(ballroom()).pdf);
    expect(text.some((t) => t.includes("60'") && t.includes("40'"))).toBe(true);
  });

  it('carries the date, or an em dash when there is none', () => {
    const undated = { ...ballroom(), meta: { ...ballroom().meta, eventDate: '' } };
    expect(extractText(exportPlanPdf(undated).pdf)).toContain('—');
  });

  it('says the occupant load is an estimate, not a determination', () => {
    // The disclaimer is load-bearing: the plan may be handed to a venue.
    const text = extractText(exportPlanPdf(ballroom()).pdf).join(' ');
    expect(text).toContain('not code determinations');
  });
});

describe('drawing the plan', () => {
  it('labels tables', () => {
    const text = extractText(exportPlanPdf(ballroom(), { scale: SCALE.imperial1_4 }).pdf);
    expect(text).toContain('T1');
    expect(text).toContain('T2');
  });

  it('omits labels too large for the object that holds them', () => {
    // Overlapping labels are worse than none: the reader cannot tell which
    // belongs to what.
    let doc = createDocument();
    doc = addElement(doc, {
      ...table('t', feet(5), feet(5)),
      label: 'An extremely long table name',
    });

    const text = extractText(exportPlanPdf(doc, { scale: SCALE.imperial1_8 }).pdf);
    expect(text).not.toContain('An extremely long table name');
  });

  it('draws seats when asked, and skips them when not', () => {
    const withSeats = exportPlanPdf(ballroom(), { showSeats: true }).pdf;
    const without = exportPlanPdf(ballroom(), { showSeats: false }).pdf;
    expect(withSeats.length).toBeGreaterThan(without.length);
  });

  it('emits a structurally valid PDF', () => {
    const pdf = exportPlanPdf(ballroom()).pdf;

    expect(pdf.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/BaseFont /Helvetica');
  });

  it('points the xref at the real byte offset of every object', () => {
    const pdf = exportPlanPdf(ballroom()).pdf;

    const entries = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThan(4);
    entries.forEach((offset, i) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${String(i + 1)} 0 obj`));
    });
  });

  it('declares content lengths matching the bytes written', () => {
    const pdf = exportPlanPdf(ballroom()).pdf;

    for (const match of pdf.matchAll(/\/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(Number(match[1])).toBe((match[2] ?? '').length);
    }
  });

  it('exports an empty document without failing', () => {
    const result = exportPlanPdf(createDocument());
    expect(result.pages).toBe(1);
    expect(result.pdf).toContain('%%EOF');
  });
});

describe('text safety', () => {
  it('escapes brackets in an event name, which would otherwise corrupt the file', () => {
    const doc = {
      ...ballroom(),
      meta: { ...ballroom().meta, name: 'Gala (rescheduled) \\ final' },
    };
    const pdf = exportPlanPdf(doc).pdf;

    // The literal must not end early.
    expect(pdf).toContain('\\(rescheduled\\)');
    expect(extractText(pdf)).toContain('Gala (rescheduled) \\ final');
  });

  it('substitutes characters the standard encoding cannot represent', () => {
    const doc = { ...ballroom(), meta: { ...ballroom().meta, name: 'Gala 🎉 2026' } };
    const text = extractText(exportPlanPdf(doc).pdf);
    expect(text.some((t) => t.startsWith('Gala '))).toBe(true);
  });
});
