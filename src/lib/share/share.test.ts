/**
 * Share links.
 *
 * The link is the whole feature: if it round-trips a plan, never reaches a
 * server, and refuses damaged input politely, sharing works. These check all
 * three, plus the size ceiling that decides when the honest answer is "send
 * them the file".
 */

import { describe, it, expect } from 'vitest';
import {
  encodeShare,
  decodeShare,
  shareLink,
  payloadFromHash,
  SHARE_KEY,
  MAX_SHARE_URL_LENGTH,
} from './share';
import { createDocument, addElement, totalSeats } from '$lib/document/document';
import { createSeatingPlan, createGuest, seatGuest } from '$lib/seating/guest';
import { findTemplate, TEMPLATES } from '$lib/templates/templates';
import { inches, feet } from '$lib/geometry/units';
import type { FloorElement } from '$lib/document/element';

const BASE = 'https://floored.app/';

function table(id: string, x: number): FloorElement {
  return {
    id,
    type: 'roundTable',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label: id.toUpperCase(),
    center: { x, y: 3000 },
    diameterMm: inches(60),
    seats: 8,
  };
}

describe('encoding a plan', () => {
  const doc = addElement(
    addElement(createDocument({ name: 'Gala' }), table('t1', 2000)),
    table('t2', 8000)
  );

  it('round-trips the document', async () => {
    const result = await decodeShare(await encodeShare(doc));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements).toEqual(doc.elements);
    expect(result.document.meta.name).toBe('Gala');
  });

  it('carries the guest list too, since a plan is not much use without it', async () => {
    const plan = seatGuest(
      { ...createSeatingPlan(), guests: [createGuest('g1', 'Ada Lovelace')] },
      'g1',
      { elementId: 't1', seatIndex: 2 }
    );

    const result = await decodeShare(await encodeShare(doc, plan));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.seating.guests[0]?.name).toBe('Ada Lovelace');
    expect(result.seating.guests[0]?.seat).toEqual({ elementId: 't1', seatIndex: 2 });
  });

  it('uses only characters that survive being in a URL', async () => {
    const payload = await encodeShare(doc);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('compresses — a plan is repetitive, and the link has a ceiling', async () => {
    let big = createDocument({ name: 'Big' });
    for (let i = 0; i < 60; i++) big = addElement(big, table(`t${String(i)}`, i * 3000));

    const payload = await encodeShare(big);
    expect(payload.length).toBeLessThan(JSON.stringify(big).length / 2);
  });
});

describe('the link', () => {
  const doc = addElement(createDocument({ name: 'Gala' }), table('t1', 2000));

  it('puts the plan in the fragment, which never reaches a server', async () => {
    const { url } = await shareLink(BASE, doc);

    const hash = url.slice(url.indexOf('#'));
    expect(hash.startsWith(`#${SHARE_KEY}=`)).toBe(true);
    // Everything before the fragment is what a host would see in a log.
    expect(url.split('#')[0]).toBe(BASE);
  });

  it('replaces an existing fragment rather than appending to it', async () => {
    const { url } = await shareLink(`${BASE}#plan=stale`, doc);
    expect(url.split('#')).toHaveLength(2);
  });

  it('reports its own length, so the UI can say when it is too long', async () => {
    const link = await shareLink(BASE, doc);
    expect(link.length).toBe(link.url.length);
    expect(link.withinLimit).toBe(true);
  });

  it('admits when a plan is too big to send as a link', async () => {
    let big = createDocument({ name: 'Convention' });
    for (let i = 0; i < 1200; i++) {
      // Varied positions and labels, so this is a genuinely large plan rather
      // than something the compressor can flatten to nothing.
      big = addElement(big, {
        ...table(`table-number-${String(i)}`, i * 137 + 11),
        label: `Table ${String(i)} — ${String(i * 7)}`,
      });
    }

    const link = await shareLink(BASE, big);
    expect(link.withinLimit).toBe(false);
    expect(link.length).toBeGreaterThan(MAX_SHARE_URL_LENGTH);
  });

  it('sends a real template within the limit, which is the case that matters', async () => {
    for (const template of TEMPLATES) {
      const link = await shareLink(BASE, template.create());
      expect(link.withinLimit).toBe(true);
    }
  });
});

describe('reading a fragment', () => {
  it('finds the payload', () => {
    expect(payloadFromHash('#plan=abc')).toBe('abc');
    expect(payloadFromHash('plan=abc')).toBe('abc');
  });

  it('ignores a fragment that is not a share', () => {
    expect(payloadFromHash('')).toBeNull();
    expect(payloadFromHash('#')).toBeNull();
    expect(payloadFromHash('#section-2')).toBeNull();
    expect(payloadFromHash('#plan=')).toBeNull();
  });
});

describe('a damaged link', () => {
  it('is refused with a sentence rather than a stack trace', async () => {
    const result = await decodeShare('not-a-real-payload');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('damaged');
  });

  it('survives being truncated by a chat client', async () => {
    const doc = addElement(createDocument(), table('t1', 2000));
    const payload = await encodeShare(doc);

    const result = await decodeShare(payload.slice(0, Math.floor(payload.length / 2)));
    expect(result.ok).toBe(false);
  });

  it('refuses a payload that decompresses to something that is not a plan', async () => {
    // Valid deflate of valid JSON that is not a document.
    const bytes = await new Response(
      new Blob(['{"hello":"world"}']).stream().pipeThrough(new CompressionStream('deflate-raw'))
    ).arrayBuffer();

    let binary = '';
    for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
    const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const result = await decodeShare(payload);
    expect(result.ok).toBe(false);
  });
});

describe('what the recipient gets', () => {
  it('is a plan they can open, with the seats it had when it was sent', async () => {
    const wedding = findTemplate('wedding');
    expect(wedding).toBeDefined();
    if (!wedding) return;

    const doc = wedding.create({ roomWidthMm: feet(70), roomDepthMm: feet(45) });
    const result = await decodeShare(await encodeShare(doc));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(totalSeats(result.document)).toBe(totalSeats(doc));
  });
});
