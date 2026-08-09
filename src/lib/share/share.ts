/**
 * Sharing a plan without a server.
 *
 * The second-ranked complaint in the research is that sharing is broken: some
 * tools make you export a PDF and email it for feedback, and where sharing does
 * exist, clients "do not understand the functions or make changes without
 * informing the creator".
 *
 * A local-first app can answer both at once. The plan is compressed into the URL
 * **fragment**, which browsers never send to a server — so the payload does not
 * reach a host even in an access log, there is nothing to host, nothing to
 * expire, and no account. And because the recipient is opening a copy, they
 * cannot silently change the original: the thing that made the incumbents'
 * sharing untrustworthy is structurally impossible here.
 *
 * Compression is `CompressionStream`, which is in every browser this project
 * supports. No dependency, no bundled deflate.
 */

import type { FlooredDocument } from '$lib/document/document';
import type { SeatingPlan } from '$lib/seating/guest';
import { serialize, parse, type ParseResult } from '$lib/document/serialize';

/**
 * The fragment key. Named rather than bare so the URL says what it holds, and
 * so anything else the fragment might carry later does not collide.
 */
export const SHARE_KEY = 'plan';

/**
 * Practical URL ceiling.
 *
 * Browsers handle far more, but the link has to survive being pasted into a
 * chat window, an email client, and whatever rewrites links in between. Beyond
 * this the honest answer is "send them the file", and the UI says so rather
 * than producing a link that fails somewhere the sender never sees.
 */
export const MAX_SHARE_URL_LENGTH = 8000;

/* ------------------------------------------------------------------ *
 * base64url — the alphabet that survives being a URL
 * ------------------------------------------------------------------ */

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array | null {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    // Not base64 at all: a truncated or hand-mangled link.
    return null;
  }
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;

  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function deflate(text: string): Promise<Uint8Array> {
  const input = new Blob([text]).stream();
  return collect(input.pipeThrough(new CompressionStream('deflate-raw')));
}

async function inflate(bytes: Uint8Array): Promise<string | null> {
  try {
    const input = new Blob([bytes as BlobPart]).stream();
    const out = await collect(input.pipeThrough(new DecompressionStream('deflate-raw')));
    return new TextDecoder().decode(out);
  } catch {
    // Not a deflate stream: someone edited the link, or it was truncated by a
    // chat client that thought it knew where the URL ended.
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Encode and decode
 * ------------------------------------------------------------------ */

/** The fragment payload for a plan: compressed, then base64url. */
export async function encodeShare(doc: FlooredDocument, seating?: SeatingPlan): Promise<string> {
  return toBase64Url(await deflate(serialize(doc, seating)));
}

export interface ShareLink {
  readonly url: string;
  /** Whether the URL is short enough to survive being pasted around. */
  readonly withinLimit: boolean;
  readonly length: number;
}

/**
 * Build the full link.
 *
 * `baseUrl` is passed in rather than read from `location`, so this stays a pure
 * function and the test suite does not need a DOM.
 */
export async function shareLink(
  baseUrl: string,
  doc: FlooredDocument,
  seating?: SeatingPlan
): Promise<ShareLink> {
  const payload = await encodeShare(doc, seating);
  // Anything already in the fragment is replaced: a share link carries one plan.
  const url = `${baseUrl.split('#')[0] ?? baseUrl}#${SHARE_KEY}=${payload}`;

  return { url, withinLimit: url.length <= MAX_SHARE_URL_LENGTH, length: url.length };
}

/** Pull the payload out of a fragment, or `null` when there is not one. */
export function payloadFromHash(hash: string): string | null {
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  if (cleaned === '') return null;

  const params = new URLSearchParams(cleaned);
  const payload = params.get(SHARE_KEY);
  return payload === null || payload === '' ? null : payload;
}

/**
 * Read a shared plan.
 *
 * Returns the same result shape as opening a file, because a shared plan is
 * exactly as untrusted as one: it arrived over a link somebody else built.
 */
export async function decodeShare(payload: string): Promise<ParseResult> {
  const bytes = fromBase64Url(payload);
  if (!bytes) return { ok: false, error: 'That share link is damaged and could not be read.' };

  const text = await inflate(bytes);
  if (text === null) {
    return { ok: false, error: 'That share link is damaged and could not be read.' };
  }

  return parse(text);
}
