/**
 * A minimal, dependency-free PDF writer — enough to emit vector line work.
 *
 * **Why this exists.** `pdf-lib` is the obvious dependency, and it is MIT, but
 * it was last published in May 2022 and unpacks to 19.5 MB. Before taking that
 * on, ADR-0010 requires checking whether a few lines of our own code will do.
 * For vector paths at a fixed scale, they will: a PDF content stream is a short
 * list of postfix operators, and ADR-0007 already requires the projection maths
 * to be ours rather than a library's.
 *
 * **Scope.** Lines, rectangles, and circles. No fonts, no images, no
 * compression, no incremental update. Phase 6 decides whether text and images
 * justify a dependency after all — this module exists to prove the projection
 * and the y-flip are right, which is the part that has to be correct before
 * anything else is built on top of it.
 *
 * PDF content-stream operators used here:
 *   `x y m`     move to          `x y l`   line to
 *   `x y w h re` rectangle       `S`       stroke
 *   `w`          line width      `c`       cubic bezier
 */

/** A drawing command in PDF page coordinates (points, origin bottom-left). */
export type PdfCommand =
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
    }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number };

/** Magic constant for approximating a circular quadrant with a cubic bezier. */
const KAPPA = 0.5522847498307936;

/** Six decimal places is far finer than any printer resolves, and keeps files small. */
function num(value: number): string {
  return parseFloat(value.toFixed(6)).toString();
}

/** Render drawing commands into a PDF content stream. */
export function toContentStream(commands: readonly PdfCommand[], lineWidthPt = 0.5): string {
  const out: string[] = [`${num(lineWidthPt)} w`];

  for (const cmd of commands) {
    switch (cmd.kind) {
      case 'line':
        out.push(`${num(cmd.x1)} ${num(cmd.y1)} m ${num(cmd.x2)} ${num(cmd.y2)} l S`);
        break;
      case 'rect':
        out.push(`${num(cmd.x)} ${num(cmd.y)} ${num(cmd.width)} ${num(cmd.height)} re S`);
        break;
      case 'circle': {
        const { cx, cy, r } = cmd;
        const k = r * KAPPA;
        out.push(
          `${num(cx + r)} ${num(cy)} m`,
          `${num(cx + r)} ${num(cy + k)} ${num(cx + k)} ${num(cy + r)} ${num(cx)} ${num(cy + r)} c`,
          `${num(cx - k)} ${num(cy + r)} ${num(cx - r)} ${num(cy + k)} ${num(cx - r)} ${num(cy)} c`,
          `${num(cx - r)} ${num(cy - k)} ${num(cx - k)} ${num(cy - r)} ${num(cx)} ${num(cy - r)} c`,
          `${num(cx + k)} ${num(cy - r)} ${num(cx + r)} ${num(cy - k)} ${num(cx + r)} ${num(cy)} c`,
          'S'
        );
        break;
      }
    }
  }

  return out.join('\n');
}

/**
 * Assemble a single-page PDF document.
 *
 * Builds the object table by measuring byte offsets as it goes, because the
 * xref table must point at exact positions — this is the one part of the PDF
 * format that punishes approximation.
 */
export function buildPdf(contentStream: string, widthPt: number, heightPt: number): string {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(widthPt)} ${num(heightPt)}] /Contents 4 0 R /Resources << >> >>`,
    `<< /Length ${String(contentStream.length)} >>\nstream\n${contentStream}\nendstream`,
  ];

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
 * Read every stroked straight line back out of a PDF's content stream.
 *
 * This exists so the ruler test can measure what was actually written to the
 * file, rather than trusting the numbers that went in.
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
