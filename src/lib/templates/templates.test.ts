/**
 * The template set.
 *
 * A template exists to hand back a plan a planner would accept, so the tests
 * check what a planner would check on first open: that it fits the room, that
 * the spacing passes the app's own clearance rules, and that the seat count is
 * plausible for the floor area rather than an arbitrary grid.
 */

import { describe, it, expect } from 'vitest';
import { TEMPLATES, findTemplate } from './templates';
import { documentBounds, totalSeats, roomAreaMm2 } from '$lib/document/document';
import { elementBounds, seatCount } from '$lib/document/element';
import { CLEARANCE, gapBetweenCircles, occupantLoad } from '$lib/geometry/clearance';
import { serialize, parse } from '$lib/document/serialize';
import { feet } from '$lib/geometry/units';

describe.each(TEMPLATES.map((t) => [t.id, t] as const))('%s', (_id, template) => {
  const doc = template.create();

  it('has a room, and it is locked so the first drag moves furniture', () => {
    const room = doc.elements.find((e) => e.type === 'room');
    expect(room?.locked).toBe(true);
  });

  it('places something to work with', () => {
    expect(doc.elements.length).toBeGreaterThan(2);
  });

  it('keeps everything inside the room', () => {
    const room = doc.elements.find((e) => e.type === 'room');
    expect(room).toBeDefined();
    if (!room) return;

    const walls = elementBounds(room);
    for (const element of doc.elements) {
      const box = elementBounds(element);
      expect(box.x).toBeGreaterThanOrEqual(walls.x);
      expect(box.y).toBeGreaterThanOrEqual(walls.y);
      expect(box.x + box.width).toBeLessThanOrEqual(walls.x + walls.width);
      expect(box.y + box.height).toBeLessThanOrEqual(walls.y + walls.height);
    }
  });

  it('opens without a table-clearance warning against itself', () => {
    const rounds = doc.elements.filter((e) => e.type === 'roundTable');

    for (let i = 0; i < rounds.length; i++) {
      for (let j = i + 1; j < rounds.length; j++) {
        const a = rounds[i];
        const b = rounds[j];
        if (a?.type !== 'roundTable' || b?.type !== 'roundTable') continue;

        const gap = gapBetweenCircles(a.center, a.diameterMm / 2, b.center, b.diameterMm / 2);
        // Only adjacent tables matter; distant pairs trivially pass.
        if (gap > CLEARANCE.betweenTablesGenerous) continue;
        expect(gap).toBeGreaterThanOrEqual(CLEARANCE.betweenTablesMin);
      }
    }
  });

  it('seats no more people than the room can legally hold', () => {
    const seats = totalSeats(doc);
    if (seats === 0) return;

    // NFPA 101 rates rows of chairs as a concentrated load and tables and
    // chairs as unconcentrated, which is the difference between 7 and 15 net
    // square feet per person — using the wrong one here would either fail a
    // legal layout or pass an illegal one.
    const concentrated = doc.elements.some((e) => e.type === 'seatingBlock');
    expect(seats).toBeLessThanOrEqual(
      occupantLoad(roomAreaMm2(doc), concentrated ? 'concentrated' : 'unconcentrated')
    );
  });

  it('round-trips through the file format', () => {
    const result = parse(serialize(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.elements).toEqual(doc.elements);
  });

  it('takes a room size, because no two venues are the same', () => {
    const bigger = template.create({ roomWidthMm: feet(100), roomDepthMm: feet(80) });
    const bounds = documentBounds(bigger);
    expect(bounds.width).toBe(feet(100));
    expect(bounds.height).toBe(feet(80));
  });

  it('carries the name it was given', () => {
    expect(template.create({ name: 'Ruth and Sam' }).meta.name).toBe('Ruth and Sam');
  });
});

describe('the set as a whole', () => {
  it('offers the seven arrangements the research named', () => {
    expect(TEMPLATES.map((t) => t.id).sort()).toEqual([
      'cabaret',
      'classroom',
      'corporate',
      'gala',
      'theatre',
      'u-shape',
      'wedding',
    ]);
  });

  it('uses unique element ids within a plan', () => {
    for (const template of TEMPLATES) {
      const ids = template.create().elements.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('is looked up by id, and says nothing rather than guessing', () => {
    expect(findTemplate('wedding')?.name).toBe('Wedding reception');
    expect(findTemplate('banquet-in-a-barn')).toBeUndefined();
  });

  it('gives a bigger room more tables', () => {
    const gala = findTemplate('gala');
    expect(gala).toBeDefined();
    if (!gala) return;

    const small = totalSeats(gala.create({ roomWidthMm: feet(40), roomDepthMm: feet(30) }));
    const large = totalSeats(gala.create({ roomWidthMm: feet(100), roomDepthMm: feet(80) }));
    expect(large).toBeGreaterThan(small);
  });

  it('degrades to a bare room rather than overlapping furniture in a tiny space', () => {
    for (const template of TEMPLATES) {
      const tiny = template.create({ roomWidthMm: feet(12), roomDepthMm: feet(10) });
      const rounds = tiny.elements.filter((e) => e.type === 'roundTable');
      expect(rounds.length).toBeLessThanOrEqual(1);
    }
  });

  it('seats the wedding template for a real guest list', () => {
    const wedding = findTemplate('wedding');
    expect(wedding).toBeDefined();
    if (!wedding) return;

    // A 60 × 40 room with a dancefloor and a head table: enough for a typical
    // reception, which is the whole claim the template makes.
    const seats = totalSeats(wedding.create());
    expect(seats).toBeGreaterThanOrEqual(48);
  });

  it('gives every seated element a nonzero seat count', () => {
    for (const template of TEMPLATES) {
      for (const element of template.create().elements) {
        if (element.type === 'roundTable' || element.type === 'seatingBlock') {
          expect(seatCount(element)).toBeGreaterThan(0);
        }
      }
    }
  });
});
