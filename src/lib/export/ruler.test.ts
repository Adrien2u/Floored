/**
 * The ruler test.
 *
 * The product claims a printed plan measures correctly with a real ruler. This
 * file is what makes that a fact rather than a marketing line: it emits a PDF,
 * reads the geometry back out of the file, and checks the distances against
 * values computed independently from the definition of an inch.
 *
 * Moved forward from Phase 6 to Phase 1 deliberately. Export reads the document
 * model, never renderer state, so none of this needs a canvas to exist — and
 * the single credibility-defining claim should not be the last thing verified.
 *
 * **If this file fails, the product's central promise is broken.** Do not adjust
 * a tolerance to make it pass.
 */

import { describe, it, expect } from 'vitest';
import { buildPdf, toContentStream, extractLines, type PdfCommand } from './minimal-pdf';
import {
  SCALE,
  PAGE,
  POINTS_PER_MM,
  mmToPdfPoints,
  pdfPointsToMm,
  projectPoint,
  fitsOnPage,
  largestFittingScale,
  scaleLabel,
} from './projection';
import { feet, inches } from '$lib/geometry/units';

describe('the conversion constant', () => {
  it('is derived from the definition of an inch, not a rounded literal', () => {
    // 1 inch = 25.4 mm exactly, and 1 inch = 72 PDF points exactly.
    expect(POINTS_PER_MM).toBe(72 / 25.4);
    expect(POINTS_PER_MM * 25.4).toBeCloseTo(72, 12);
  });

  it('round-trips through the inverse', () => {
    for (const scale of [SCALE.full, SCALE.imperial1_8, SCALE.metric1_50]) {
      expect(pdfPointsToMm(mmToPdfPoints(1000, scale), scale)).toBeCloseTo(1000, 9);
    }
  });
});

describe('ruler test — a 1000 mm reference line', () => {
  const REFERENCE_MM = 1000;

  it('measures exactly 1000 mm on the page at full size', () => {
    const page = PAGE.letter;
    const start = { x: 0, y: 0 };
    const end = { x: REFERENCE_MM, y: 0 };

    const a = projectPoint(start, SCALE.full, page);
    const b = projectPoint(end, SCALE.full, page);

    const commands: PdfCommand[] = [{ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }];
    const pdf = buildPdf(toContentStream(commands), page.widthPt, page.heightPt);

    const lines = extractLines(pdf);
    expect(lines).toHaveLength(1);

    const line = lines[0];
    expect(line).toBeDefined();
    if (!line) return;

    const drawnPt = Math.hypot(line.x2 - line.x1, line.y2 - line.y1);

    // Independent expectation: 1000 mm is 39.3700787... inches, which at
    // 72 points per inch is 2834.645669... points.
    const expectedPt = (REFERENCE_MM / 25.4) * 72;
    expect(drawnPt).toBeCloseTo(expectedPt, 4);

    // And the same fact stated as the user experiences it: measured back off
    // the page, the line is 1000 mm.
    expect(pdfPointsToMm(drawnPt, SCALE.full)).toBeCloseTo(REFERENCE_MM, 4);
  });

  it('measures correctly at architectural scale', () => {
    const page = PAGE.letterLandscape;
    const scale = SCALE.imperial1_8; // 1/8" = 1'-0"

    const a = projectPoint({ x: 0, y: 0 }, scale, page);
    const b = projectPoint({ x: feet(60), y: 0 }, scale, page);

    const pdf = buildPdf(
      toContentStream([{ kind: 'line', x1: a.x, y1: a.y, x2: b.x, y2: b.y }]),
      page.widthPt,
      page.heightPt
    );

    const line = extractLines(pdf)[0];
    expect(line).toBeDefined();
    if (!line) return;

    const drawnPt = Math.abs(line.x2 - line.x1);

    // 60 feet at 1/8" = 1'-0" is 60 eighths of an inch = 7.5 inches = 540 points.
    expect(drawnPt).toBeCloseTo(540, 6);

    // Held against a scale rule, it reads 60 feet.
    expect(pdfPointsToMm(drawnPt, scale)).toBeCloseTo(feet(60), 2);
  });

  it('keeps a 60-inch table 60 inches wide on paper', () => {
    const scale = SCALE.imperial1_4;
    const drawnPt = mmToPdfPoints(inches(60), scale);

    // 60 inches at 1/4" = 1'-0" is 5 feet x 1/4" = 1.25 inches = 90 points.
    expect(drawnPt).toBeCloseTo(90, 1);
    expect(pdfPointsToMm(drawnPt, scale) / 25.4).toBeCloseTo(60, 1);
  });
});

describe('the y-axis flip', () => {
  // PDF puts the origin bottom-left with +y up; the document model puts it
  // top-left with +y down. Getting this wrong yields a plan that is correct in
  // every dimension and printed upside down.

  it('places the document origin near the top of the page', () => {
    const page = PAGE.letter;
    const topLeft = projectPoint({ x: 0, y: 0 }, SCALE.full, page);

    expect(topLeft.x).toBe(page.marginPt);
    expect(topLeft.y).toBe(page.heightPt - page.marginPt);
  });

  it('moves down the document as y increases, which is up the page decreasing', () => {
    const page = PAGE.letter;
    const top = projectPoint({ x: 0, y: 0 }, SCALE.full, page);
    const lower = projectPoint({ x: 0, y: 100 }, SCALE.full, page);

    expect(lower.y).toBeLessThan(top.y);
    expect(top.y - lower.y).toBeCloseTo(mmToPdfPoints(100, SCALE.full), 9);
  });

  it('preserves distances despite the flip', () => {
    const page = PAGE.letter;
    const a = projectPoint({ x: 0, y: 0 }, SCALE.full, page);
    const b = projectPoint({ x: 300, y: 400 }, SCALE.full, page);

    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(mmToPdfPoints(500, SCALE.full), 9);
  });
});

describe('page fitting', () => {
  const ROOM_W = feet(60);
  const ROOM_H = feet(40);

  it('fits a 60 x 40 ft ballroom on landscape letter at 1/8 inch scale', () => {
    expect(fitsOnPage(ROOM_W, ROOM_H, SCALE.imperial1_8, PAGE.letterLandscape)).toBe(true);
  });

  it('does not fit the same room at 1/2 inch scale', () => {
    expect(fitsOnPage(ROOM_W, ROOM_H, SCALE.imperial1_2, PAGE.letterLandscape)).toBe(false);
  });

  it('picks the largest standard scale that fits', () => {
    const chosen = largestFittingScale(ROOM_W, ROOM_H, PAGE.letterLandscape);
    expect(chosen).toBe(SCALE.imperial1_8);
  });

  it('never mixes measuring systems, since a rule only reads its own scales', () => {
    // 1/96 and 1/100 are close enough to look interchangeable and are not: a
    // metric scale rule cannot measure a sheet drawn at 1/8" = 1'-0".
    expect(largestFittingScale(ROOM_W, ROOM_H, PAGE.letterLandscape, 'metric')).toBe(
      SCALE.metric1_100
    );
    expect(largestFittingScale(ROOM_W, ROOM_H, PAGE.letterLandscape, 'imperial')).toBe(
      SCALE.imperial1_8
    );
  });

  it('prefers the larger scale when two would both fit', () => {
    // Letter portrait gives 540 x 720 pt of drawable area. A 20 ft room is
    // 360 pt at 1/4" and 720 pt at 1/2", so 1/4" is the largest that fits and
    // 1/8" — which also fits — must not be chosen.
    const room = feet(20);
    expect(largestFittingScale(room, room, PAGE.letter, 'imperial')).toBe(SCALE.imperial1_4);

    // A 10 ft room has room to spare at the largest scale we offer.
    const smaller = feet(10);
    expect(largestFittingScale(smaller, smaller, PAGE.letter, 'imperial')).toBe(SCALE.imperial1_2);
  });

  it('returns null rather than inventing a scale when nothing fits', () => {
    const stadium = feet(500);
    expect(largestFittingScale(stadium, stadium, PAGE.letter)).toBeNull();
  });
});

describe('scale labels', () => {
  it('names the standard scales the way a title block does', () => {
    expect(scaleLabel(SCALE.imperial1_8)).toBe('1/8" = 1\'-0"');
    expect(scaleLabel(SCALE.imperial1_4)).toBe('1/4" = 1\'-0"');
    expect(scaleLabel(SCALE.metric1_50)).toBe('1:50');
    expect(scaleLabel(SCALE.full)).toBe('1:1');
  });

  it('falls back to a ratio for a non-standard scale', () => {
    expect(scaleLabel(1 / 75)).toBe('1:75');
  });
});

describe('PDF structure', () => {
  it('emits a parseable single-page document', () => {
    const pdf = buildPdf(toContentStream([]), 612, 792);

    expect(pdf.startsWith('%PDF-1.7')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/MediaBox [0 0 612 792]');
    expect(pdf).toContain('startxref');
  });

  it('points the xref table at the real byte offset of each object', () => {
    const pdf = buildPdf(toContentStream([]), 612, 792);

    const startxref = /startxref\n(\d+)/.exec(pdf);
    expect(startxref).not.toBeNull();
    const xrefOffset = Number(startxref?.[1]);
    expect(pdf.slice(xrefOffset, xrefOffset + 4)).toBe('xref');

    // Each declared offset must actually land on its object header.
    const entries = [...pdf.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(4);
    entries.forEach((offset, i) => {
      expect(pdf.slice(offset)).toMatch(new RegExp(`^${String(i + 1)} 0 obj`));
    });
  });

  it('declares a content stream length matching the bytes written', () => {
    const stream = toContentStream([{ kind: 'line', x1: 0, y1: 0, x2: 100, y2: 100 }]);
    const pdf = buildPdf(stream, 612, 792);

    const declared = /\/Length (\d+)/.exec(pdf);
    expect(Number(declared?.[1])).toBe(stream.length);
  });

  it('draws circles as four bezier arcs', () => {
    const stream = toContentStream([{ kind: 'circle', cx: 100, cy: 100, r: 50 }]);
    expect((stream.match(/ c$/gm) ?? []).length).toBe(4);
  });
});
