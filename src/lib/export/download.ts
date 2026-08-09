/**
 * Handing a file to the user.
 *
 * There is no server, so "export" means producing bytes in the tab and letting
 * the browser save them (ADR-0005). Every path here works in Chrome, Edge,
 * Firefox, and Safari without a permission prompt.
 */

import type { FlooredDocument } from '$lib/document/document';
import { serialize } from '$lib/document/serialize';
import { exportPlanPdf, type ExportOptions } from './plan-pdf';
import { exportPlanSvg, type SvgOptions } from './plan-svg';

/**
 * Trigger a download of text content.
 *
 * The object URL is revoked on the next tick rather than immediately: revoking
 * synchronously races the browser's own fetch of the blob, and the download
 * silently produces an empty file in some engines.
 */
export function downloadText(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: mimeType });
  downloadBlob(filename, blob);
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

/**
 * A filename derived from the plan's own name.
 *
 * Users name their plans after events, and events have apostrophes, slashes,
 * and colons in them — every one of which is illegal in a filename on some
 * platform. Falling back to a generic name beats producing a download the
 * operating system refuses to save.
 */
export function safeFilename(name: string, extension: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 80);

  return `${cleaned || 'floor-plan'}.${extension}`;
}

/** Save the document itself — the format the user owns. */
export function saveDocument(doc: FlooredDocument): void {
  downloadText(safeFilename(doc.meta.name, 'floored'), serialize(doc), 'application/json');
}

export function savePdf(doc: FlooredDocument, options?: ExportOptions): void {
  const result = exportPlanPdf(doc, options);
  downloadText(safeFilename(doc.meta.name, 'pdf'), result.pdf, 'application/pdf');
}

export function saveSvg(doc: FlooredDocument, options?: SvgOptions): void {
  downloadText(safeFilename(doc.meta.name, 'svg'), exportPlanSvg(doc, options), 'image/svg+xml');
}

/**
 * Save the current canvas as a PNG.
 *
 * The only rasterized output, and documented as screen-quality: a PNG has no
 * scale, so it cannot be measured. It exists for pasting a plan into an email
 * or a slide, never for handing to a venue — that is what the PDF is for.
 */
export async function savePng(canvas: HTMLCanvasElement, name: string): Promise<void> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new Error('The browser could not produce a PNG from the canvas.');
  downloadBlob(safeFilename(name, 'png'), blob);
}

/**
 * Read a `.floored` file the user picked.
 *
 * Returns the text; parsing and validating it is the document layer's job, and
 * keeping those separate is what lets a malformed file produce a readable error
 * rather than a half-loaded plan.
 */
export function readFile(file: File): Promise<string> {
  return file.text();
}
