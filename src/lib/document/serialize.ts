/**
 * Reading and writing `.floored` files.
 *
 * ADR-0004 makes a permanent promise: **every future version opens every file
 * ever written by any earlier version.** That promise is why this module exists
 * as its own layer rather than a pair of `JSON` calls — parsing is where the
 * guarantee is kept or broken.
 *
 * A `.floored` file is untrusted input, even when it came from this app. It may
 * have been hand-edited (the format is plain JSON precisely so it can be), it
 * may have arrived in a share link, or it may be hostile. Parsing therefore
 * validates rather than casts, and refuses politely instead of throwing
 * halfway through and leaving a half-built document on screen.
 */

import type { FlooredDocument, DocumentMeta } from './document';
import { CURRENT_SCHEMA_VERSION, createDocument } from './document';
import type { FloorElement, FixtureKind } from './element';
import { DEFAULT_LAYERS } from './element';
import type { Point } from '$lib/geometry/vec';

/** Bound on accepted file size. A plan is small; anything larger is a mistake or an attack. */
export const MAX_FILE_BYTES = 32 * 1024 * 1024;

/** Bound on element count, for the same reason. */
export const MAX_ELEMENTS = 100_000;

export type ParseResult =
  | { readonly ok: true; readonly document: FlooredDocument; readonly migratedFrom?: number }
  | { readonly ok: false; readonly error: string };

/**
 * Serialize a document. Two-space indent keeps the file diffable in git.
 *
 * Keys are written in a **canonical order**, not whatever order the object
 * happens to carry. `JSON.stringify` preserves insertion order, so a plan built
 * in the editor and the same plan loaded from disk would otherwise serialize to
 * byte-different files with identical content — every save churning the diff of
 * a format whose whole point is being diffable.
 */
export function serialize(doc: FlooredDocument): string {
  return JSON.stringify(canonicalDocument(doc), null, 2);
}

function canonicalDocument(doc: FlooredDocument): unknown {
  return {
    schemaVersion: doc.schemaVersion,
    meta: {
      name: doc.meta.name,
      eventDate: doc.meta.eventDate,
      notes: doc.meta.notes,
      unitSystem: doc.meta.unitSystem,
    },
    layers: [...doc.layers],
    elements: doc.elements.map(canonicalElement),
  };
}

function canonicalElement(element: FloorElement): unknown {
  // Identity first, then shared presentation, then the type-specific geometry.
  // A reader scanning a diff sees which element changed before what changed.
  const base = {
    id: element.id,
    type: element.type,
    layer: element.layer,
    label: element.label,
    locked: element.locked,
    rotationDeg: element.rotationDeg,
  };

  switch (element.type) {
    case 'room':
      return { ...base, points: element.points.map((p) => ({ x: p.x, y: p.y })) };
    case 'roundTable':
      return {
        ...base,
        center: { x: element.center.x, y: element.center.y },
        diameterMm: element.diameterMm,
        seats: element.seats,
      };
    case 'rectTable':
      return {
        ...base,
        origin: { x: element.origin.x, y: element.origin.y },
        widthMm: element.widthMm,
        depthMm: element.depthMm,
        seats: element.seats,
      };
    case 'fixture':
      return {
        ...base,
        kind: element.kind,
        origin: { x: element.origin.x, y: element.origin.y },
        widthMm: element.widthMm,
        depthMm: element.depthMm,
      };
    case 'note':
      return { ...base, origin: { x: element.origin.x, y: element.origin.y }, text: element.text };
  }
}

/**
 * Parse a `.floored` file.
 *
 * Never throws. Returns a discriminated result so the caller can show the user
 * what is wrong with their file instead of a stack trace.
 */
export function parse(text: string): ParseResult {
  if (text.length > MAX_FILE_BYTES) {
    return { ok: false, error: 'File is too large to be a floor plan.' };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'File is not valid JSON.' };
  }

  if (!isRecord(raw)) {
    return { ok: false, error: 'File does not contain a plan object.' };
  }

  const version = raw['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, error: 'File is missing a valid schemaVersion.' };
  }

  if (version > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This plan was made with a newer version of Floored (format ${String(version)}). Update to open it.`,
    };
  }

  const migrated = migrate(raw, version);
  const document = readDocument(migrated);
  if (!document) {
    return { ok: false, error: 'Plan data is malformed and could not be read.' };
  }

  return version < CURRENT_SCHEMA_VERSION
    ? { ok: true, document, migratedFrom: version }
    : { ok: true, document };
}

/**
 * Migration chain.
 *
 * One step per version bump, applied in order, each taking the shape produced
 * by the previous one. Steps are never edited once released — a released
 * migration is the only record of what old files actually looked like.
 *
 * There is nothing here yet because version 1 is the first release. The chain
 * exists now, tested, so that the first real migration is a data change rather
 * than an architecture change made under time pressure.
 */
const MIGRATIONS: Record<number, (doc: Record<string, unknown>) => Record<string, unknown>> = {};

function migrate(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let doc = raw;
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (step) doc = step(doc);
  }
  return { ...doc, schemaVersion: CURRENT_SCHEMA_VERSION };
}

/* ------------------------------------------------------------------ *
 * Validation. Unknown data in, typed data out — or undefined.
 * ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function int(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readPoint(value: unknown): Point | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value['x'] !== 'number' || typeof value['y'] !== 'number') return undefined;
  if (!Number.isFinite(value['x']) || !Number.isFinite(value['y'])) return undefined;
  return { x: Math.round(value['x']), y: Math.round(value['y']) };
}

function readMeta(value: unknown): DocumentMeta {
  const base = createDocument().meta;
  if (!isRecord(value)) return base;
  const units = value['unitSystem'];
  return {
    name: str(value['name'], base.name),
    eventDate: str(value['eventDate']),
    notes: str(value['notes']),
    unitSystem: units === 'metric' ? 'metric' : 'imperial',
  };
}

const FIXTURE_KINDS: readonly FixtureKind[] = [
  'stage',
  'dancefloor',
  'bar',
  'buffet',
  'av',
  'column',
  'other',
];

function readElement(value: unknown): FloorElement | undefined {
  if (!isRecord(value)) return undefined;

  const id = str(value['id']);
  if (id === '') return undefined;

  const base = {
    id,
    layer: str(value['layer'], 'furniture'),
    rotationDeg: int(value['rotationDeg']),
    locked: bool(value['locked']),
    label: str(value['label']),
  };

  switch (value['type']) {
    case 'room': {
      const rawPoints = value['points'];
      if (!Array.isArray(rawPoints)) return undefined;
      const points = rawPoints.map(readPoint).filter((p): p is Point => p !== undefined);
      // Fewer than three vertices is not a room; dropping it beats rendering a
      // degenerate shape that reports zero area into the occupant-load estimate.
      if (points.length < 3) return undefined;
      return { ...base, type: 'room', points };
    }

    case 'roundTable': {
      const center = readPoint(value['center']);
      const diameterMm = int(value['diameterMm']);
      if (!center || diameterMm <= 0) return undefined;
      return {
        ...base,
        type: 'roundTable',
        center,
        diameterMm,
        seats: Math.max(0, int(value['seats'])),
      };
    }

    case 'rectTable': {
      const origin = readPoint(value['origin']);
      const widthMm = int(value['widthMm']);
      const depthMm = int(value['depthMm']);
      if (!origin || widthMm <= 0 || depthMm <= 0) return undefined;
      return {
        ...base,
        type: 'rectTable',
        origin,
        widthMm,
        depthMm,
        seats: Math.max(0, int(value['seats'])),
      };
    }

    case 'fixture': {
      const origin = readPoint(value['origin']);
      const widthMm = int(value['widthMm']);
      const depthMm = int(value['depthMm']);
      if (!origin || widthMm <= 0 || depthMm <= 0) return undefined;
      const kind = value['kind'];
      return {
        ...base,
        type: 'fixture',
        kind: FIXTURE_KINDS.includes(kind as FixtureKind) ? (kind as FixtureKind) : 'other',
        origin,
        widthMm,
        depthMm,
      };
    }

    case 'note': {
      const origin = readPoint(value['origin']);
      if (!origin) return undefined;
      return { ...base, type: 'note', origin, text: str(value['text']) };
    }

    default:
      // An unknown element type comes from a newer version of the format. The
      // version gate above already refused those, so reaching here means the
      // file is malformed rather than merely newer.
      return undefined;
  }
}

function readDocument(raw: Record<string, unknown>): FlooredDocument | undefined {
  const rawElements = raw['elements'];
  if (!Array.isArray(rawElements)) return undefined;
  if (rawElements.length > MAX_ELEMENTS) return undefined;

  const elements = rawElements.map(readElement).filter((e): e is FloorElement => e !== undefined);

  const rawLayers = raw['layers'];
  const layers =
    Array.isArray(rawLayers) && rawLayers.length > 0
      ? rawLayers.filter((l): l is string => typeof l === 'string')
      : [...DEFAULT_LAYERS];

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: readMeta(raw['meta']),
    layers: layers.length > 0 ? layers : [...DEFAULT_LAYERS],
    elements,
  };
}
