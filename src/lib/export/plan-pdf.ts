/**
 * Exporting a plan to PDF.
 *
 * Reads the document model and nothing else — never renderer state, never the
 * screen canvas (ADR-0007). That independence is what let the ruler test run in
 * Phase 1, before a renderer existed, and it is what keeps the printed sheet
 * honest: the PDF is a second rendering of the same millimetre truth, not a
 * picture of the screen.
 */

import type { FlooredDocument } from '$lib/document/document';
import { documentBounds } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { seatingBlockSize, SEAT_SIZE_MM, seatCount } from '$lib/document/element';
import { rectCenter, rotatePoint } from '$lib/geometry/transform';
import type { Point } from '$lib/geometry/vec';
import { formatLength } from '$lib/geometry/units';
import { seatPositions } from '$lib/render/scene';
import {
  mmToPdfPoints,
  pdfPointsToMm,
  scaleLabel,
  largestFittingScale,
  PAGE,
  SCALE,
  type DrawingScale,
  type PageSpec,
} from './projection';
import { buildPdf, toContentStream, type PdfCommand, type PdfPage } from './minimal-pdf';
import { textWidth } from './pdf-font';

/** Height of the title block strip along the bottom of every sheet. */
const TITLE_BLOCK_HEIGHT_PT = 54;

const LINE_THIN = 0.4;
const LINE_MEDIUM = 0.7;
const LINE_HEAVY = 1.2;

const GREY_INK = 0;
const GREY_MUTED = 0.45;
const GREY_LIGHT = 0.75;

export interface ExportOptions {
  readonly page?: PageSpec;
  /** Omit to pick the largest standard scale that fits. */
  readonly scale?: DrawingScale;
  readonly system?: 'imperial' | 'metric';
  /** Draw a seat at every generated position. Off for very large plans. */
  readonly showSeats?: boolean;
  /** Sheet number labels assume this is one plan; used in the title block. */
  readonly sheetTitle?: string;
}

export interface ExportResult {
  readonly pdf: string;
  readonly scale: DrawingScale;
  /** The scale as a title block would write it, e.g. `1/8" = 1'-0"`. */
  readonly scaleLabel: string;
  readonly pages: number;
  /** True when the plan needed more than one sheet. */
  readonly tiled: boolean;
}

/**
 * Export a document as a to-scale PDF.
 *
 * Picks the largest standard scale that fits on one page, and falls back to
 * tiling at the smallest standard scale rather than inventing an intermediate
 * one — no physical scale rule reads 1:83, so a sheet drawn at it cannot be
 * measured, which defeats the point of the export.
 */
export function exportPlanPdf(doc: FlooredDocument, options: ExportOptions = {}): ExportResult {
  const page = options.page ?? PAGE.letterLandscape;
  const system = options.system ?? doc.meta.unitSystem;
  const bounds = documentBounds(doc);

  const drawable = {
    widthPt: page.widthPt - page.marginPt * 2,
    heightPt: page.heightPt - page.marginPt * 2 - TITLE_BLOCK_HEIGHT_PT,
  };

  const scale =
    options.scale ??
    largestFittingScale(bounds.width, bounds.height, page, system) ??
    (system === 'imperial' ? SCALE.imperial1_8 : SCALE.metric1_100);

  const contentWidthPt = mmToPdfPoints(bounds.width, scale);
  const contentHeightPt = mmToPdfPoints(bounds.height, scale);

  const columns = Math.max(1, Math.ceil(contentWidthPt / drawable.widthPt));
  const rows = Math.max(1, Math.ceil(contentHeightPt / drawable.heightPt));
  const tiled = columns * rows > 1;

  const pages: PdfPage[] = [];
  let sheet = 0;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      sheet += 1;

      // Document coordinate that lands at the top-left of this sheet's drawable
      // area. Tiles step by exactly one drawable width, so a dimension spanning
      // a sheet break still measures correctly on each half.
      const originMm: Point = {
        x: Math.round(bounds.x + pdfPointsToMm(column * drawable.widthPt, scale)),
        y: Math.round(bounds.y + pdfPointsToMm(row * drawable.heightPt, scale)),
      };

      const commands = [
        ...drawDocument(doc, originMm, scale, page, options.showSeats ?? true),
        ...drawTitleBlock(doc, scale, page, system, sheet, columns * rows, options.sheetTitle),
      ];

      pages.push({
        widthPt: page.widthPt,
        heightPt: page.heightPt,
        content: toContentStream(commands, LINE_MEDIUM),
      });
    }
  }

  return {
    pdf: buildPdf(pages),
    scale,
    scaleLabel: scaleLabel(scale),
    pages: pages.length,
    tiled,
  };
}

/** Project a document point onto this sheet. */
function project(
  point: Point,
  originMm: Point,
  scale: DrawingScale,
  page: PageSpec
): { x: number; y: number } {
  const xPt = page.marginPt + mmToPdfPoints(point.x - originMm.x, scale);
  const yFromTopPt = page.marginPt + mmToPdfPoints(point.y - originMm.y, scale);
  return { x: xPt, y: page.heightPt - yFromTopPt };
}

function drawDocument(
  doc: FlooredDocument,
  originMm: Point,
  scale: DrawingScale,
  page: PageSpec,
  showSeats: boolean
): PdfCommand[] {
  const commands: PdfCommand[] = [];
  for (const element of doc.elements) {
    commands.push(...drawElement(element, originMm, scale, page, showSeats));
  }
  return commands;
}

function drawElement(
  element: FloorElement,
  originMm: Point,
  scale: DrawingScale,
  page: PageSpec,
  showSeats: boolean
): PdfCommand[] {
  const to = (p: Point) => project(p, originMm, scale, page);
  const len = (mm: number) => mmToPdfPoints(mm, scale);

  switch (element.type) {
    case 'room': {
      // Walls are the heaviest line on the sheet, as on any architectural plan:
      // the reader should see the room's shape before anything inside it.
      const commands: PdfCommand[] = [];
      const points = element.points;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (!a || !b) continue;
        const pa = to(a);
        const pb = to(b);
        commands.push({
          kind: 'line',
          x1: pa.x,
          y1: pa.y,
          x2: pb.x,
          y2: pb.y,
          widthPt: LINE_HEAVY,
        });
      }
      return commands;
    }

    case 'roundTable': {
      const centre = to(element.center);
      const commands: PdfCommand[] = [];

      if (showSeats) {
        for (const seat of seatPositions(
          element.center,
          element.diameterMm,
          element.seats,
          element.rotationDeg
        )) {
          const s = to(seat);
          commands.push({
            kind: 'circle',
            cx: s.x,
            cy: s.y,
            r: len(SEAT_SIZE_MM / 2) * 0.8,
            widthPt: LINE_THIN,
            grey: GREY_LIGHT,
          });
        }
      }

      commands.push({
        kind: 'circle',
        cx: centre.x,
        cy: centre.y,
        r: len(element.diameterMm / 2),
        widthPt: LINE_MEDIUM,
        grey: GREY_INK,
      });

      if (element.label !== '') {
        commands.push(...centredLabel(element.label, centre, len(element.diameterMm), GREY_INK));
      }
      return commands;
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
      const pivot = rectCenter(rect);
      const corners: Point[] = [
        { x: rect.x, y: rect.y },
        { x: rect.x + rect.width, y: rect.y },
        { x: rect.x + rect.width, y: rect.y + rect.height },
        { x: rect.x, y: rect.y + rect.height },
      ].map((corner) =>
        element.rotationDeg === 0 ? corner : rotatePoint(corner, pivot, element.rotationDeg)
      );

      const commands: PdfCommand[] = [];
      for (let i = 0; i < corners.length; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % corners.length];
        if (!a || !b) continue;
        const pa = to(a);
        const pb = to(b);
        commands.push({ kind: 'line', x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y });
      }

      const label = element.label !== '' ? element.label : '';
      if (label !== '') {
        commands.push(...centredLabel(label, to(pivot), len(rect.width), GREY_MUTED));
      }
      return commands;
    }

    case 'note': {
      const at = to(element.origin);
      return [{ kind: 'text', x: at.x, y: at.y, text: element.text, sizePt: 7, grey: GREY_MUTED }];
    }
  }
}

/**
 * A label centred in an object, sized to fit inside it.
 *
 * Skipped entirely when the object is too small to hold readable text —
 * overlapping labels are worse than none on a printed plan, because the reader
 * cannot tell which one belongs to what.
 */
function centredLabel(
  text: string,
  centre: { x: number; y: number },
  availableWidthPt: number,
  grey: number
): PdfCommand[] {
  const sizePt = Math.min(8, Math.max(4, availableWidthPt * 0.22));
  if (sizePt < 4.5) return [];

  const width = textWidth(text, sizePt);
  if (width > availableWidthPt * 0.9) return [];

  return [
    {
      kind: 'text',
      x: centre.x - width / 2,
      // Nudged down by roughly a third of the size: PDF positions text on its
      // baseline, so centring on the anchor would sit it visibly high.
      y: centre.y - sizePt * 0.35,
      text,
      sizePt,
      grey,
    },
  ];
}

/**
 * The title block.
 *
 * The convention a venue expects on a plan handed to them: what the event is,
 * what scale the sheet is drawn at, and which sheet of how many. Without the
 * scale a to-scale drawing is unmeasurable, which makes this strip the most
 * load-bearing text on the page.
 */
function drawTitleBlock(
  doc: FlooredDocument,
  scale: DrawingScale,
  page: PageSpec,
  system: 'imperial' | 'metric',
  sheet: number,
  totalSheets: number,
  sheetTitle?: string
): PdfCommand[] {
  const left = page.marginPt;
  const right = page.widthPt - page.marginPt;
  const top = page.marginPt + TITLE_BLOCK_HEIGHT_PT;

  const bounds = documentBounds(doc);
  const seats = doc.elements.reduce((sum, e) => sum + seatCount(e), 0);

  const fields: [string, string][] = [
    ['EVENT', doc.meta.name],
    ['DATE', doc.meta.eventDate || '—'],
    ['SCALE', scaleLabel(scale)],
    ['EXTENT', `${formatLength(bounds.width, system)} × ${formatLength(bounds.height, system)}`],
    ['SEATS', String(seats)],
    ['SHEET', totalSheets > 1 ? `${String(sheet)} of ${String(totalSheets)}` : '1'],
  ];

  const commands: PdfCommand[] = [
    { kind: 'line', x1: left, y1: top, x2: right, y2: top, widthPt: LINE_MEDIUM },
  ];

  if (sheetTitle) {
    commands.push({
      kind: 'text',
      x: left,
      y: top - 16,
      text: sheetTitle,
      sizePt: 11,
      grey: GREY_INK,
    });
  }

  const columnWidth = (right - left) / fields.length;
  fields.forEach(([key, value], i) => {
    const x = left + columnWidth * i;
    commands.push(
      { kind: 'text', x, y: top - 32, text: key, sizePt: 5.5, grey: GREY_MUTED },
      { kind: 'text', x, y: top - 44, text: value, sizePt: 8, grey: GREY_INK }
    );
  });

  commands.push({
    kind: 'text',
    x: left,
    y: page.marginPt - 4,
    text: 'Drawn with Floored. Occupant load figures are planning estimates, not code determinations.',
    sizePt: 5.5,
    grey: GREY_LIGHT,
  });

  return commands;
}
