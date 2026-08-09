/**
 * The day-of outputs.
 *
 * These are the sheets the event actually runs on, so the tests check what a
 * person holding the paper would check: that every name is present, that it is
 * next to the right table, and that the list is in the order someone would look
 * a name up in.
 */

import { describe, it, expect } from 'vitest';
import { createDocument, addElement, type FlooredDocument } from '$lib/document/document';
import type { FloorElement } from '$lib/document/element';
import { createSeatingPlan, createGuest, seatGuest, type SeatingPlan } from '$lib/seating/guest';
import { inches } from '$lib/geometry/units';
import { extractText, countPages } from './minimal-pdf';
import { findMySeatPdf, tableSheetsPdf, placeCardsPdf, checkInPdf, dayOfPackPdf } from './day-of';

function table(id: string, label: string, x: number): FloorElement {
  return {
    id,
    type: 'roundTable',
    layer: 'furniture',
    rotationDeg: 0,
    locked: false,
    label,
    center: { x, y: 3000 },
    diameterMm: inches(60),
    seats: 8,
  };
}

const doc: FlooredDocument = addElement(
  addElement(createDocument({ name: 'Gala' }), table('t1', 'T1', 2000)),
  table('t2', 'T2', 8000)
);

/** Two seated guests on T1, one on T2, one nobody has placed yet. */
function plan(): SeatingPlan {
  const base: SeatingPlan = {
    ...createSeatingPlan(),
    guests: [
      createGuest('g1', 'Ada Lovelace', { dietary: 'Vegetarian' }),
      createGuest('g2', 'Grace Hopper'),
      createGuest('g3', 'Katsushika Hokusai'),
      createGuest('g4', 'Rembrandt van Rijn'),
    ],
  };

  let next = seatGuest(base, 'g1', { elementId: 't1', seatIndex: 1 });
  next = seatGuest(next, 'g2', { elementId: 't1', seatIndex: 0 });
  next = seatGuest(next, 'g3', { elementId: 't2', seatIndex: 0 });
  return next;
}

describe('find my seat', () => {
  const text = extractText(findMySeatPdf(doc, plan())).join('\n');

  it('lists every seated guest beside their table', () => {
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('T1');
    expect(text).toContain('T2');
  });

  it('leaves out anyone who has no seat, since it answers "where do I sit"', () => {
    expect(text).not.toContain('Rembrandt');
  });

  it('sorts by surname, which is how a person scans a board', () => {
    const lines = extractText(findMySeatPdf(doc, plan()));
    const names = lines.filter((l) => l.includes(' '));
    // Hokusai, Hopper, Lovelace — by surname, not by first name. Ada would
    // come first under either rule, so Hokusai before Lovelace is the
    // assertion that can only pass if the sort is by surname.
    expect(names.indexOf('Katsushika Hokusai')).toBeLessThan(names.indexOf('Grace Hopper'));
    expect(names.indexOf('Grace Hopper')).toBeLessThan(names.indexOf('Ada Lovelace'));
  });

  it('says so plainly when nobody is seated', () => {
    const empty = extractText(findMySeatPdf(doc, createSeatingPlan())).join(' ');
    expect(empty).toContain('Nobody is seated yet');
  });
});

describe('table sheets', () => {
  it('prints one page per table, in numbering order', () => {
    expect(countPages(tableSheetsPdf(doc, plan()))).toBe(2);
  });

  it('carries the seat number, the name, and the dietary flag a server needs', () => {
    const text = extractText(tableSheetsPdf(doc, plan())).join('\n');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Vegetarian');
    // Seat indices are zero-based internally and one-based on paper.
    expect(text).toContain('2.');
  });

  it('says a table is empty rather than printing a blank page', () => {
    const text = extractText(tableSheetsPdf(doc, createSeatingPlan())).join('\n');
    expect(text).toContain('Nobody seated');
  });

  it('does not print a raw element id anywhere', () => {
    const text = extractText(tableSheetsPdf(doc, plan())).join('\n');
    expect(text).not.toContain('t1');
  });
});

describe('place cards', () => {
  it('prints each name twice, so the card reads from both sides of the fold', () => {
    const names = extractText(placeCardsPdf(doc, plan())).filter((t) => t === 'Ada Lovelace');
    expect(names).toHaveLength(2);
  });

  it('names the table on the card', () => {
    expect(extractText(placeCardsPdf(doc, plan())).join('\n')).toContain('T1');
  });

  it('fits four cards to a sheet', () => {
    expect(countPages(placeCardsPdf(doc, plan()))).toBe(1);
  });
});

describe('check-in sheet', () => {
  const text = extractText(checkInPdf(doc, plan())).join('\n');

  it('includes guests with no seat — the ones the door most needs to see', () => {
    expect(text).toContain('Rembrandt van Rijn');
    expect(text).toContain('Not seated');
  });

  it('lists everybody', () => {
    for (const name of ['Ada Lovelace', 'Grace Hopper', 'Katsushika Hokusai']) {
      expect(text).toContain(name);
    }
  });
});

describe('all four outputs', () => {
  it('produce a valid PDF even from an empty plan', () => {
    const empty = createDocument();
    for (const pdf of [
      findMySeatPdf(empty, createSeatingPlan()),
      tableSheetsPdf(empty, createSeatingPlan()),
      placeCardsPdf(empty, createSeatingPlan()),
      checkInPdf(empty, createSeatingPlan()),
    ]) {
      expect(pdf.startsWith('%PDF-')).toBe(true);
      expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
      expect(countPages(pdf)).toBeGreaterThan(0);
    }
  });

  it('stamps the event name on the sheet, so a stack of paper stays identifiable', () => {
    const text = extractText(checkInPdf(doc, plan(), { eventName: 'Gala' })).join('\n');
    expect(text).toContain('Gala');
  });

  it('paginates rather than running off the bottom of the page', () => {
    const many: SeatingPlan = {
      ...createSeatingPlan(),
      guests: Array.from({ length: 200 }, (_, i) =>
        createGuest(`g${String(i)}`, `Guest ${String(i).padStart(3, '0')} Surname`)
      ),
    };
    expect(countPages(checkInPdf(doc, many))).toBeGreaterThan(1);
  });
});

describe('the day-of pack', () => {
  it('is one file holding every sheet, since a browser allows one download per click', () => {
    const pack = dayOfPackPdf(doc, plan());
    const separate =
      countPages(findMySeatPdf(doc, plan())) +
      countPages(tableSheetsPdf(doc, plan())) +
      countPages(placeCardsPdf(doc, plan())) +
      countPages(checkInPdf(doc, plan()));

    expect(countPages(pack)).toBe(separate);
  });

  it('carries the content of all four sheets', () => {
    const text = extractText(dayOfPackPdf(doc, plan())).join('\n');
    expect(text).toContain('Find your seat');
    expect(text).toContain('Check in');
    // Only the table sheet prints a seat count line.
    expect(text).toContain('of 8 seats');
    // Only the check-in sheet lists the unseated.
    expect(text).toContain('Rembrandt van Rijn');
  });
});
