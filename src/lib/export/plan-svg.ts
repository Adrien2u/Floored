/**
 * Exporting a plan to SVG.
 *
 * SVG is an **output conversion**, not a third coordinate projection
 * (ADR-0006). It reuses the PDF projection: SVG user units are arbitrarily
 * mappable, so setting the viewBox in PDF points and declaring a physical
 * width in millimetres makes an SVG that opens at the same true scale as the
 * PDF, in Illustrator or in a browser.
 *
 * That is the whole reason to route through the existing projection rather
 * than writing millimetres straight into the file: one set of maths, one place
 * for it to be wrong.
 */

import type { FlooredDocument } from '$lib/document/document';
import { documentBounds } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { seatingBlockSize, SEAT_SIZE_MM } from '$lib/document/element';
import { rectCenter } from '$lib/geometry/transform';
import type { Point } from '$lib/geometry/vec';
import { seatPositions } from '$lib/render/scene';
import {
  mmToPdfPoints,
  scaleLabel,
  largestFittingScale,
  PAGE,
  SCALE,
  type DrawingScale,
} from './projection';

export interface SvgOptions {
  readonly scale?: DrawingScale;
  readonly showSeats?: boolean;
  /** Margin around the plan, in millimetres of real-world space. */
  readonly marginMm?: number;
}

const STROKE_WALL = 1.2;
const STROKE_OBJECT = 0.7;
const STROKE_SEAT = 0.4;

/** Escape text for XML content. Unescaped angle brackets produce invalid SVG. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(value: number): string {
  return parseFloat(value.toFixed(4)).toString();
}

/**
 * Export a document as SVG at true scale.
 *
 * The root element carries a physical `width` and `height` in millimetres, so
 * printing the file at 100% produces a measurable sheet — the same guarantee
 * the PDF makes, by the same arithmetic.
 */
export function exportPlanSvg(doc: FlooredDocument, options: SvgOptions = {}): string {
  const bounds = documentBounds(doc);
  const marginMm = options.marginMm ?? 500;

  const scale =
    options.scale ??
    largestFittingScale(bounds.width, bounds.height, PAGE.letterLandscape, doc.meta.unitSystem) ??
    SCALE.imperial1_8;

  const originMm: Point = { x: bounds.x - marginMm, y: bounds.y - marginMm };
  const widthPt = mmToPdfPoints(bounds.width + marginMm * 2, scale);
  const heightPt = mmToPdfPoints(bounds.height + marginMm * 2, scale);

  // A PDF point is 1/72 inch, which is 25.4/72 mm. Declaring the physical size
  // in millimetres is what makes "print at 100%" mean something.
  const widthMm = (widthPt * 25.4) / 72;
  const heightMm = (heightPt * 25.4) / 72;

  const body = doc.elements
    .map((element) => svgForElement(element, originMm, scale, options))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" version="1.1"`,
    `  width="${fmt(widthMm)}mm" height="${fmt(heightMm)}mm"`,
    `  viewBox="0 0 ${fmt(widthPt)} ${fmt(heightPt)}">`,
    `  <title>${escapeXml(doc.meta.name)}</title>`,
    `  <desc>Drawn with Floored at ${escapeXml(scaleLabel(scale))}. Geometry is true to scale.</desc>`,
    '  <g fill="none" stroke="#000" stroke-linejoin="round">',
    body,
    '  </g>',
    '</svg>',
    '',
  ].join('\n');
}

/** Project a document point into SVG user units, which are PDF points. */
function project(point: Point, originMm: Point, scale: DrawingScale): { x: number; y: number } {
  return {
    x: mmToPdfPoints(point.x - originMm.x, scale),
    // SVG shares the document's y-down convention, so unlike PDF there is no
    // flip here — which is exactly why the flip lives in the projection layer
    // rather than being baked into the maths.
    y: mmToPdfPoints(point.y - originMm.y, scale),
  };
}

function svgForElement(
  element: FloorElement,
  originMm: Point,
  scale: DrawingScale,
  options: SvgOptions
): string {
  const to = (p: Point) => project(p, originMm, scale);
  const len = (mm: number) => mmToPdfPoints(mm, scale);

  switch (element.type) {
    case 'room': {
      const points = element.points.map((p) => {
        const s = to(p);
        return `${fmt(s.x)},${fmt(s.y)}`;
      });
      return `    <polygon points="${points.join(' ')}" stroke-width="${STROKE_WALL}" />`;
    }

    case 'roundTable': {
      const centre = to(element.center);
      const parts: string[] = [];

      if (options.showSeats ?? true) {
        for (const seat of seatPositions(
          element.center,
          element.diameterMm,
          element.seats,
          element.rotationDeg
        )) {
          const s = to(seat);
          parts.push(
            `    <circle cx="${fmt(s.x)}" cy="${fmt(s.y)}" r="${fmt(len(SEAT_SIZE_MM / 2) * 0.8)}" stroke="#999" stroke-width="${STROKE_SEAT}" />`
          );
        }
      }

      parts.push(
        `    <circle cx="${fmt(centre.x)}" cy="${fmt(centre.y)}" r="${fmt(len(element.diameterMm / 2))}" stroke-width="${STROKE_OBJECT}" />`
      );

      if (element.label !== '') {
        parts.push(
          `    <text x="${fmt(centre.x)}" y="${fmt(centre.y)}" font-family="Helvetica, sans-serif" font-size="${fmt(Math.max(4, len(element.diameterMm) * 0.2))}" text-anchor="middle" dominant-baseline="central" fill="#000" stroke="none">${escapeXml(element.label)}</text>`
        );
      }
      return parts.join('\n');
    }

    case 'rectTable':
    case 'fixture':
    case 'seatingBlock': {
      const size =
        element.type === 'seatingBlock'
          ? seatingBlockSize(element)
          : { widthMm: element.widthMm, depthMm: element.depthMm };

      const rect = {
        x: element.origin.x,
        y: element.origin.y,
        width: size.widthMm,
        height: size.depthMm,
      };
      const topLeft = to({ x: rect.x, y: rect.y });
      const pivot = to(rectCenter(rect));

      const transform =
        element.rotationDeg === 0
          ? ''
          : ` transform="rotate(${fmt(element.rotationDeg)} ${fmt(pivot.x)} ${fmt(pivot.y)})"`;

      return `    <rect x="${fmt(topLeft.x)}" y="${fmt(topLeft.y)}" width="${fmt(len(rect.width))}" height="${fmt(len(rect.height))}" stroke-width="${STROKE_OBJECT}"${transform} />`;
    }

    case 'note': {
      const at = to(element.origin);
      return `    <text x="${fmt(at.x)}" y="${fmt(at.y)}" font-family="Helvetica, sans-serif" font-size="7" fill="#555" stroke="none">${escapeXml(element.text)}</text>`;
    }
  }
}
