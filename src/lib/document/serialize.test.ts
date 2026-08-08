import { describe, it, expect } from 'vitest';
import { serialize, parse, MAX_FILE_BYTES } from './serialize';
import { createDocument, addElement, CURRENT_SCHEMA_VERSION } from './document';
import type { FloorElement } from './element';
import { inches, feet } from '$lib/geometry/units';

const table = (id: string): FloorElement => ({
  id,
  type: 'roundTable',
  layer: 'furniture',
  rotationDeg: 45,
  locked: false,
  label: id.toUpperCase(),
  center: { x: 3000, y: 4000 },
  diameterMm: inches(60),
  seats: 8,
});

const room: FloorElement = {
  id: 'room1',
  type: 'room',
  layer: 'room',
  rotationDeg: 0,
  locked: true,
  label: 'Ballroom',
  points: [
    { x: 0, y: 0 },
    { x: feet(60), y: 0 },
    { x: feet(60), y: feet(40) },
    { x: 0, y: feet(40) },
  ],
};

function sample() {
  let doc = createDocument({ name: 'Spring Gala', eventDate: '2026-05-16', unitSystem: 'metric' });
  doc = addElement(doc, room);
  doc = addElement(doc, table('t1'));
  doc = addElement(doc, {
    id: 'f1',
    type: 'fixture',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label: 'Stage',
    kind: 'stage',
    origin: { x: 6000, y: 300 },
    widthMm: feet(20),
    depthMm: feet(5),
  });
  doc = addElement(doc, {
    id: 'n1',
    type: 'note',
    layer: 'annotations',
    rotationDeg: 0,
    locked: false,
    label: '',
    origin: { x: 100, y: 100 },
    text: 'Load-in via north door',
  });
  return doc;
}

describe('round trip', () => {
  it('returns an identical document', () => {
    const doc = sample();
    const result = parse(serialize(doc));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document).toEqual(doc);
  });

  it('writes keys in a canonical order regardless of how the document was built', () => {
    // A plan built in the editor and the same plan loaded from disk carry their
    // keys in different insertion orders. Without canonical output, every save
    // would rewrite the whole file and churn the git diff.
    const built = sample();
    const loaded = parse(serialize(built));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    expect(serialize(loaded.document)).toBe(serialize(built));
  });

  it('is stable across repeated round trips', () => {
    const once = serialize(sample());
    const twiceResult = parse(once);
    expect(twiceResult.ok).toBe(true);
    if (!twiceResult.ok) return;

    expect(serialize(twiceResult.document)).toBe(once);
  });

  it('writes indented JSON so plans stay diffable in git', () => {
    const text = serialize(sample());
    expect(text).toContain('\n  "schemaVersion"');
    expect(text.split('\n').length).toBeGreaterThan(20);
  });

  it('does not report a migration for a current-version file', () => {
    const result = parse(serialize(sample()));
    expect(result.ok && result.migratedFrom).toBeUndefined();
  });
});

describe('rejecting bad input', () => {
  // A .floored file is untrusted even when this app wrote it: the format is
  // plain JSON precisely so people can hand-edit it, and share links carry it
  // across the network. Parsing must refuse politely, never throw.

  const bad: [string, string][] = [
    ['not JSON at all', 'not json {{{'],
    ['a JSON array', '[]'],
    ['a JSON string', '"hello"'],
    ['null', 'null'],
    ['an object with no version', '{"elements":[]}'],
    ['a non-integer version', '{"schemaVersion":1.5,"elements":[]}'],
    ['a zero version', '{"schemaVersion":0,"elements":[]}'],
    ['a version from the future', '{"schemaVersion":99,"elements":[]}'],
    ['no elements array', '{"schemaVersion":1}'],
    ['elements as an object', '{"schemaVersion":1,"elements":{}}'],
  ];

  for (const [name, text] of bad) {
    it(`refuses ${name} without throwing`, () => {
      const result = parse(text);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.length).toBeGreaterThan(0);
    });
  }

  it('explains that a newer file needs an update, rather than failing vaguely', () => {
    const result = parse('{"schemaVersion":99,"elements":[]}');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('newer version');
  });

  it('refuses a file larger than the cap without parsing it', () => {
    const huge = `{"schemaVersion":1,"elements":[]}${' '.repeat(MAX_FILE_BYTES)}`;
    const result = parse(huge);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('too large');
  });
});

describe('dropping malformed elements without losing the plan', () => {
  // One corrupt table should cost the user that table, not the whole evening's
  // work. Every case here keeps the surrounding document intact.

  it('drops an element with no id', () => {
    const result = parse('{"schemaVersion":1,"elements":[{"type":"note","origin":{"x":0,"y":0}}]}');
    expect(result.ok && result.document.elements).toHaveLength(0);
  });

  it('drops a room with fewer than three vertices', () => {
    const result = parse(
      '{"schemaVersion":1,"elements":[{"id":"r","type":"room","points":[{"x":0,"y":0},{"x":1,"y":1}]}]}'
    );
    expect(result.ok && result.document.elements).toHaveLength(0);
  });

  it('drops a table with a non-positive diameter', () => {
    const result = parse(
      '{"schemaVersion":1,"elements":[{"id":"t","type":"roundTable","center":{"x":0,"y":0},"diameterMm":0,"seats":8}]}'
    );
    expect(result.ok && result.document.elements).toHaveLength(0);
  });

  it('drops an element of unknown type', () => {
    const result = parse('{"schemaVersion":1,"elements":[{"id":"x","type":"hologram"}]}');
    expect(result.ok && result.document.elements).toHaveLength(0);
  });

  it('drops NaN and Infinity coordinates, which JSON cannot even hold', () => {
    const result = parse(
      '{"schemaVersion":1,"elements":[{"id":"t","type":"roundTable","center":{"x":"NaN","y":0},"diameterMm":1524}]}'
    );
    expect(result.ok && result.document.elements).toHaveLength(0);
  });

  it('keeps the good elements around a broken one', () => {
    const doc = sample();
    const raw = JSON.parse(serialize(doc)) as { elements: unknown[] };
    raw.elements.splice(1, 0, { id: 'broken', type: 'roundTable', center: { x: 0, y: 0 } });

    const result = parse(JSON.stringify(raw));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements.map((e) => e.id)).toEqual(['room1', 't1', 'f1', 'n1']);
  });
});

describe('filling in missing optional data', () => {
  it('defaults meta rather than refusing the file', () => {
    const result = parse('{"schemaVersion":1,"elements":[]}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.meta.name).toBe('Untitled plan');
    expect(result.document.meta.unitSystem).toBe('imperial');
  });

  it('falls back to the default layers when none are listed', () => {
    const result = parse('{"schemaVersion":1,"elements":[]}');
    expect(result.ok && result.document.layers).toEqual(['room', 'furniture', 'annotations']);
  });

  it('coerces an unrecognized unit system to imperial', () => {
    const result = parse('{"schemaVersion":1,"meta":{"unitSystem":"cubits"},"elements":[]}');
    expect(result.ok && result.document.meta.unitSystem).toBe('imperial');
  });

  it('coerces an unrecognized fixture kind to "other" rather than dropping it', () => {
    const result = parse(
      '{"schemaVersion":1,"elements":[{"id":"f","type":"fixture","kind":"trebuchet","origin":{"x":0,"y":0},"widthMm":1000,"depthMm":1000}]}'
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fixture = result.document.elements[0];
    expect(fixture?.type === 'fixture' && fixture.kind).toBe('other');
  });

  it('rounds fractional coordinates onto the millimetre lattice', () => {
    const result = parse(
      '{"schemaVersion":1,"elements":[{"id":"t","type":"roundTable","center":{"x":100.6,"y":100.4},"diameterMm":1524,"seats":8}]}'
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const t = result.document.elements[0];
    expect(t?.type === 'roundTable' && t.center).toEqual({ x: 101, y: 100 });
  });
});

describe('the compatibility guarantee', () => {
  it('always writes the current version', () => {
    expect(serialize(createDocument())).toContain(
      `"schemaVersion": ${String(CURRENT_SCHEMA_VERSION)}`
    );
  });

  it('stamps a migrated document with the current version', () => {
    // Version 1 is the first release, so there is nothing to migrate yet. The
    // chain is exercised here so the first real migration is a data change
    // rather than an architecture change made under pressure.
    const result = parse('{"schemaVersion":1,"elements":[]}');
    expect(result.ok && result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});
