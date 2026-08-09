/**
 * A minimal, dependency-free PDF writer.
 *
 * **Why this exists.** `pdf-lib` is the obvious dependency, and it is MIT, but
 * it was last published in May 2022 and unpacks to 19.5 MB. ADR-0010 asks
 * whether a few lines of our own code will do before asking which library to
 * use, and for vector line work plus one standard font, they will.
 *
 * ADR-0011 left font embedding as the open risk that might reverse the
 * decision. It did not: PDF guarantees fourteen fonts in every reader, so
 * referencing Helvetica costs a dictionary and no embedded bytes. See
 * `pdf-font.ts`.
 *
 * **Scope.** Lines, rectangles, circles, and text, across as many pages as a
 * plan needs. No images, no compression, no incremental update, no forms.
 *
 * Content-stream operators used here:
 *   `x y m` move to     `x y l` line to      `x y w h re` rectangle
 *   `c` cubic bezier    `S` stroke           `f` fill
 *   `w` line width      `g` / `rg` grey and colour
 *   `BT`/`ET` text object   `/F1 s Tf` font and size   `x y Td` position
 *   `(text) Tj` show text    `d` dash pattern
 */

import { FONT_RESOURCE, escapeText, toWinAnsi, fromWinAnsi, fontDictionary } from './pdf-font';

/** A drawing command in PDF page coordinates (points, origin bottom-left). */
export type PdfCommand =
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly widthPt?: number;
      readonly dash?: readonly number[];
      readonly grey?: number;
    }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly fill?: boolean;
      readonly widthPt?: number;
      readonly grey?: number;
    }
  | {
      readonly kind: 'circle';
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill?: boolean;
      readonly widthPt?: number;
      readonly grey?: number;
    }
  | {
      readonly kind: 'text';
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly sizePt: number;
      readonly grey?: number;
    };

/** Magic constant for approximating a circular quadrant with a cubic bezier. */
const KAPPA = 0.5522847498307936;

/** Six decimals is far finer than any printer resolves, and keeps files small. */
function num(value: number): string {
  return parseFloat(value.toFixed(6)).toString();
}

/** Render drawing commands into a PDF content stream. */
export function toContentStream(commands: readonly PdfCommand[], defaultWidthPt = 0.5): string {
  const out: string[] = [];
  let currentWidth = -1;
  let currentGrey = -1;
  let currentDash = '';

  const setWidth = (w: number) => {
    if (w === currentWidth) return;
    out.push(`${num(w)} w`);
    currentWidth = w;
  };
  const setGrey = (g: number) => {
    if (g === currentGrey) return;
    out.push(`${num(g)} G ${num(g)} g`);
    currentGrey = g;
  };
  const setDash = (dash: readonly number[] | undefined) => {
    const next = dash && dash.length > 0 ? `[${dash.map(num).join(' ')}] 0 d` : '[] 0 d';
    if (next === currentDash) return;
    out.push(next);
    currentDash = next;
  };

  for (const cmd of commands) {
    setGrey(cmd.kind === 'text' ? (cmd.grey ?? 0) : (cmd.grey ?? 0));

    switch (cmd.kind) {
      case 'line':
        setWidth(cmd.widthPt ?? defaultWidthPt);
        setDash(cmd.dash);
        out.push(`${num(cmd.x1)} ${num(cmd.y1)} m ${num(cmd.x2)} ${num(cmd.y2)} l S`);
        break;

      case 'rect':
        setWidth(cmd.widthPt ?? defaultWidthPt);
        setDash(undefined);
        out.push(
          `${num(cmd.x)} ${num(cmd.y)} ${num(cmd.width)} ${num(cmd.height)} re ${cmd.fill ? 'f' : 'S'}`
        );
        break;

      case 'circle': {
        setWidth(cmd.widthPt ?? defaultWidthPt);
        setDash(undefined);
        const { cx, cy, r } = cmd;
        const k = r * KAPPA;
        out.push(
          `${num(cx + r)} ${num(cy)} m`,
          `${num(cx + r)} ${num(cy + k)} ${num(cx + k)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c`,
          `${num(cx - k)} ${num(cy + r)} ${num(cx - r)} ${num(cy + k)} ${num(cx - r)} ${num(cy)} c`,
          `${num(cx - r)} ${num(cy - k)} ${num(cx - k)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c`,
          `${num(cx + k)} ${num(cy - r)} ${num(cx + r)} ${num(cy - k)} ${num(cx + r)} ${num(cy)} c`,
          cmd.fill ? 'f' : 'S'
        );
        break;
      }

      case 'text':
        out.push(
          'BT',
          `/${FONT_RESOURCE} ${num(cmd.sizePt)} Tf`,
          `${num(cmd.x)} ${num(cmd.y)} Td`,
          `(${escapeText(toWinAnsi(cmd.text))}) Tj`,
          'ET'
        );
        break;
    }
  }

  return out.join('\n');
}

export interface PdfPage {
  readonly widthPt: number;
  readonly heightPt: number;
  readonly content: string;
}

/**
 * Assemble a multi-page PDF document.
 *
 * Object numbering: 1 = catalog, 2 = pages tree, 3 = font, then a page object
 * and a content stream per page. Byte offsets are measured as the file is built,
 * because the xref table must point at exact positions — the one part of the
 * format that punishes approximation.
 */
export function buildPdf(pages: readonly PdfPage[]): string {
  if (pages.length === 0) {
    return buildPdf([{ widthPt: 612, heightPt: 792, content: '' }]);
  }

  const FIRST_PAGE_OBJ = 4;
  const pageIds = pages.map((_, i) => FIRST_PAGE_OBJ + i * 2);
  const kids = pageIds.map((id) => `${String(id)} 0 R`).join(' ');

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${kids}] /Count ${String(pages.length)} >>`,
    fontDictionary(),
  ];

  pages.forEach((page, i) => {
    // Each page occupies two consecutive object slots: the page dictionary and
    // its content stream. Derived rather than looked up, so the numbering has a
    // single definition.
    const pageId = FIRST_PAGE_OBJ + i * 2;
    const contentId = pageId + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(page.widthPt)} ${num(page.heightPt)}] ` +
        `/Resources << /Font << /${FONT_RESOURCE} 3 0 R >> >> /Contents ${String(contentId)} 0 R >>`,
      `<< /Length ${String(page.content.length)} >>\nstream\n${page.content}\nendstream`
    );
  });

  let pdf = '%PDF-1.7\n';
  const offsets: number[] = [];

  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${String(i + 1)} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n`;
  pdf += `startxref\n${String(xrefOffset)}\n%%EOF\n`;

  return pdf;
}

/**
 * Read every stroked straight line back out of a PDF's content streams.
 *
 * Exists so the ruler test can measure what was actually written to the file
 * rather than trusting the numbers that went in.
 */
export function extractLines(pdf: string): { x1: number; y1: number; x2: number; y2: number }[] {
  const pattern = /(-?[\d.]+) (-?[\d.]+) m (-?[\d.]+) (-?[\d.]+) l S/g;
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

  for (const match of pdf.matchAll(pattern)) {
    const [, a, b, c, d] = match;
    if (a === undefined || b === undefined || c === undefined || d === undefined) continue;
    lines.push({ x1: Number(a), y1: Number(b), x2: Number(c), y2: Number(d) });
  }

  return lines;
}

/** Read every piece of text back out, for asserting on the title block. */
export function extractText(pdf: string): string[] {
  return [...pdf.matchAll(/\((.*?)\) Tj/g)].map((m) =>
    fromWinAnsi((m[1] ?? '').replace(/\\([\\()])/g, '$1'))
  );
}

/** Count the pages a document declares. */
export function countPages(pdf: string): number {
  const match = /\/Count (\d+)/.exec(pdf);
  return match ? Number(match[1]) : 0;
}
