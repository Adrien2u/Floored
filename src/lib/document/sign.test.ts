/**
 * The sign element, end to end through the file format.
 *
 * Signs are the first element type added since the format made its
 * open-everything promise (ADR-0004) with real files in the wild, so the round
 * trip and the v3 → v4 step are pinned here rather than left to the general
 * serializer tests.
 */

import { describe, it, expect } from 'vitest';
import { serialize, parse } from './serialize';
import { createDocument, addElement, CURRENT_SCHEMA_VERSION } from './document';
import type { FloorElement, SignMount, FixtureKind } from './element';
import { elementBounds, elementPosition, moveElement } from './element';
import { inches } from '$lib/geometry/units';

const MOUNTS: readonly SignMount[] = ['aFrame', 'tableTent', 'banner', 'cartBoard', 'wall'];

/** The kinds added in v4, which had no representation before. */
const NEW_KINDS: readonly FixtureKind[] = [
  'registration',
  'giftStation',
  'photoBooth',
  'display',
  'kiosk',
  'lounge',
];

function sign(id: string, mount: SignMount): FloorElement {
  return {
    id,
    type: 'sign',
    layer: 'signage',
    rotationDeg: 90,
    locked: false,
    label: `Sign ${id}`,
    mount,
    origin: { x: 1200, y: 3400 },
    widthMm: inches(24),
    depthMm: inches(20),
    faceHeightMm: inches(36),
    sponsor: 'Example Sponsor',
    doubleSided: true,
  };
}

describe('signs through the file format', () => {
  it('round-trips every mount without losing a field', () => {
    let doc = createDocument();
    for (const mount of MOUNTS) doc = addElement(doc, sign(mount, mount));

    const result = parse(serialize(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.elements).toEqual(doc.elements);
  });

  it('round-trips every fixture kind added in v4', () => {
    let doc = createDocument();
    for (const kind of NEW_KINDS) {
      doc = addElement(doc, {
        id: kind,
        type: 'fixture',
        layer: 'furniture',
        rotationDeg: 0,
        locked: false,
        label: kind,
        kind,
        origin: { x: 0, y: 0 },
        widthMm: 2438,
        depthMm: 762,
      });
    }

    const result = parse(serialize(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Without the kind list being extended, each of these would silently read
    // back as 'other' and the plan would lose the distinction it was drawn for.
    expect(result.document.elements.map((e) => e.type === 'fixture' && e.kind)).toEqual([
      ...NEW_KINDS,
    ]);
  });

  it('writes byte-identical output on a second save', () => {
    let doc = createDocument();
    for (const mount of MOUNTS) doc = addElement(doc, sign(mount, mount));

    const once = serialize(doc);
    const twice = parse(once);
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;

    expect(serialize(twice.document)).toBe(once);
  });

  it('refuses a sign with an unrecognised mount rather than guessing one', () => {
    const text = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      elements: [{ ...sign('s', 'aFrame'), mount: 'skywriting' }],
    });

    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Dropped, not defaulted: redrawing someone's A-frame as a wall panel is a
    // quieter failure than the sign going missing, and a worse one.
    expect(result.document.elements).toEqual([]);
  });

  it('refuses a sign with no footprint', () => {
    const text = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      elements: [{ ...sign('s', 'aFrame'), widthMm: 0 }],
    });

    const result = parse(text);
    expect(result.ok && result.document.elements).toEqual([]);
  });
});

describe('migrating a v3 file', () => {
  const v3 = JSON.stringify({
    schemaVersion: 3,
    meta: { name: 'Old plan', eventDate: '2025-10-20', notes: '', unitSystem: 'imperial' },
    layers: ['room', 'furniture', 'annotations'],
    elements: [
      {
        id: 'bar',
        type: 'fixture',
        layer: 'furniture',
        label: 'BAR',
        locked: false,
        rotationDeg: 0,
        kind: 'bar',
        origin: { x: 100, y: 200 },
        widthMm: 2438,
        depthMm: 762,
      },
    ],
  });

  it('reaches v4 with its elements unchanged', () => {
    const result = parse(v3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.migratedFrom).toBe(3);
    expect(result.document.elements).toHaveLength(1);
    expect(result.document.elements[0]?.id).toBe('bar');
  });

  it('leaves the old layer list alone rather than appending signage to it', () => {
    const result = parse(v3);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Rewriting a user's layer list on open is a change to their document that
    // they did not ask for. New documents get the layer; old ones do not.
    expect(result.document.layers).toEqual(['room', 'furniture', 'annotations']);
  });
});

describe('signs behave like any other placed object', () => {
  it('reports bounds that cover the rotated footprint', () => {
    const rotated = sign('s', 'aFrame');
    const bounds = elementBounds(rotated);

    // Rotated 90°, so width and depth swap in the axis-aligned box.
    expect(Math.round(bounds.width)).toBe(inches(20));
    expect(Math.round(bounds.height)).toBe(inches(24));
  });

  it('anchors and moves from its origin', () => {
    const s = sign('s', 'tableTent');
    expect(elementPosition(s)).toEqual({ x: 1200, y: 3400 });

    const moved = moveElement(s, 100, -50);
    expect(elementPosition(moved)).toEqual({ x: 1300, y: 3350 });
    // The original is untouched (ADR-0003).
    expect(elementPosition(s)).toEqual({ x: 1200, y: 3400 });
  });
});
