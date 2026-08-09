/**
 * The compatibility guarantee.
 *
 * ADR-0004 promises that **every future version of Floored opens every file
 * ever written by any earlier version**. A promise without a test is a wish,
 * so this file loads a real v1 file from `tests/fixtures/` and checks it still
 * works after the v2 bump.
 *
 * The corpus grows by one file per released version. Fixtures are never edited
 * after release — they are the only record of what old files actually looked
 * like, and rewriting one silently changes the meaning of every plan already in
 * the wild.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse, serialize } from './serialize';
import { CURRENT_SCHEMA_VERSION } from './document';
import { totalSeats, roomAreaMm2 } from './document';
import { occupantLoad } from '$lib/geometry/clearance';

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../tests/fixtures/${name}`, import.meta.url)),
    'utf8'
  );
}

describe('opening a version 1 file', () => {
  const text = fixture('v1-sample.floored');

  it('parses without error', () => {
    const result = parse(text);
    expect(result.ok).toBe(true);
  });

  it('reports that it was migrated, and from which version', () => {
    const result = parse(text);
    expect(result.ok && result.migratedFrom).toBe(1);
  });

  it('stamps the migrated document with the current version', () => {
    const result = parse(text);
    expect(result.ok && result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('keeps every element, in order', () => {
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.elements.map((e) => e.id)).toEqual(['room', 't1', 't2', 'stage', 'n1']);
  });

  it('preserves the metadata a user typed', () => {
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.document.meta.name).toBe('Autumn Fundraiser');
    expect(result.document.meta.eventDate).toBe('2025-10-04');
    expect(result.document.meta.unitSystem).toBe('imperial');
  });

  it('preserves geometry exactly, to the millimetre', () => {
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const table = result.document.elements.find((e) => e.id === 't1');
    expect(table?.type === 'roundTable' && table.center).toEqual({ x: 3000, y: 3000 });
    expect(table?.type === 'roundTable' && table.diameterMm).toBe(1524);
  });

  it('keeps the room locked, as it was saved', () => {
    const result = parse(text);
    expect(result.ok && result.document.elements[0]?.locked).toBe(true);
  });

  it('still computes the same capacity figures', () => {
    // A migrated plan must mean the same thing it meant when it was saved.
    // 60 x 40 ft = 2400 sq ft, and 2400 / 15 = 160.
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(totalSeats(result.document)).toBe(16);
    expect(occupantLoad(roomAreaMm2(result.document))).toBe(160);
  });

  it('re-saves as the current version, and re-opens without migrating again', () => {
    const first = parse(text);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = parse(serialize(first.document));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.migratedFrom).toBeUndefined();
    expect(second.document).toEqual(first.document);
  });
});

describe('the migration chain', () => {
  it('walks every step between the file version and the current one', () => {
    // With v1 -> v2 in place this is a single hop, but the assertion is about
    // the chain being walked rather than the number of steps in it: a v1 file
    // must arrive at whatever the current version is, however far away that is.
    const result = parse(fixture('v1-sample.floored'));
    expect(result.ok && result.document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('refuses a version from the future rather than guessing', () => {
    const ahead = JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
      elements: [],
    });

    const result = parse(ahead);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('newer version');
  });
});

describe('opening a version 2 file', () => {
  const text = fixture('v2-sample.floored');

  it('parses, and reports the version it came from', () => {
    const result = parse(text);
    expect(result.ok && result.migratedFrom).toBe(2);
  });

  it('keeps the seating block that version 2 introduced', () => {
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const block = result.document.elements.find((e) => e.id === 'seats-a');
    expect(block?.type).toBe('seatingBlock');
    // 4 rows of 6.
    expect(totalSeats(result.document)).toBe(8 + 24);
  });

  it('gives a file written before guests existed an empty guest list', () => {
    const result = parse(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.seating.guests).toEqual([]);
    expect(result.seating.assignmentsLocked).toBe(false);
  });

  it('round-trips to the current version without further migration', () => {
    const first = parse(text);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = parse(serialize(first.document, first.seating));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.migratedFrom).toBeUndefined();
    expect(second.document).toEqual(first.document);
  });
});
