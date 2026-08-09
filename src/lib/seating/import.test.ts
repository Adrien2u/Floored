import { describe, it, expect } from 'vitest';
import { parseCsv, guessMapping, normalizeHeader, mappingIsUsable, readName } from './csv';
import { previewImport, applyImport, sourceKeyFor } from './import';
import { createSeatingPlan, seatGuest, findGuest, guestsAt, type SeatingPlan } from './guest';

/** Deterministic ids, so tests can assert on them. */
function counterIds() {
  let n = 0;
  return () => `id${String(++n)}`;
}

const SIMPLE = `Name,Email,Company,Meal,Dietary
Amara Osei,amara@example.com,Acme Catering,Beef,
Ben Osei,ben@example.com,Acme Catering,Fish,Shellfish allergy
Priya Raman,priya@example.com,Raman Group,Vegetarian,
`;

function importFresh(csv: string): SeatingPlan {
  const { headers, rows } = parseCsv(csv);
  const mapping = guessMapping(headers);
  return applyImport(createSeatingPlan(), rows, { mapping, newId: counterIds() }).plan;
}

describe('parsing', () => {
  it('reads headers and rows', () => {
    const { headers, rows } = parseCsv(SIMPLE);
    expect(headers).toEqual(['name', 'email', 'company', 'meal', 'dietary']);
    expect(rows).toHaveLength(3);
    expect(rows[0]?.name).toBe('Amara Osei');
  });

  it('handles quoted commas, which is the whole reason CSV is not split()', () => {
    const { rows } = parseCsv('Name,Notes\n"Osei, Amara","Arriving late, seat near door"\n');
    expect(rows[0]?.name).toBe('Osei, Amara');
    expect(rows[0]?.notes).toBe('Arriving late, seat near door');
  });

  it('handles doubled quotes inside a quoted cell', () => {
    const { rows } = parseCsv('Name\n"She said ""hello"""\n');
    expect(rows[0]?.name).toBe('She said "hello"');
  });

  it('handles a newline inside a quoted cell', () => {
    const { rows } = parseCsv('Name,Notes\nAmara,"line one\nline two"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.notes).toBe('line one\nline two');
  });

  it('strips the BOM Excel writes, which would corrupt the first header', () => {
    const { headers } = parseCsv('﻿Name,Email\nAmara,a@example.com\n');
    expect(headers[0]).toBe('name');
  });

  it('handles CRLF endings', () => {
    const { rows } = parseCsv('Name,Email\r\nAmara,a@example.com\r\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe('a@example.com');
  });

  it('skips blank rows rather than importing empty guests', () => {
    const { rows } = parseCsv('Name\nAmara\n\n\nBen\n');
    expect(rows.map((r) => r.name)).toEqual(['Amara', 'Ben']);
  });

  it('tolerates a file with only headers', () => {
    expect(parseCsv('Name,Email\n').rows).toEqual([]);
  });

  it('tolerates an empty file', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });

  it('tolerates a short row', () => {
    const { rows } = parseCsv('Name,Email,Company\nAmara\n');
    expect(rows[0]?.email).toBe('');
  });
});

describe('column mapping', () => {
  it('normalizes headers so spelling and spacing do not matter', () => {
    expect(normalizeHeader('First Name')).toBe('firstname');
    expect(normalizeHeader('  E-Mail_Address ')).toBe('emailaddress');
  });

  it('guesses common headers', () => {
    const mapping = guessMapping(['name', 'email', 'company', 'meal', 'dietary']);
    expect(mapping.name).toBe('name');
    expect(mapping.group).toBe('company');
    expect(mapping.meal).toBe('meal');
  });

  it('recognises split name columns', () => {
    const mapping = guessMapping(['firstname', 'lastname']);
    expect(mapping.firstName).toBe('firstname');
    expect(mappingIsUsable(mapping)).toBe(true);
  });

  it('is unusable without any name column', () => {
    expect(mappingIsUsable(guessMapping(['email', 'company']))).toBe(false);
  });

  it('joins split names', () => {
    const mapping = guessMapping(['firstname', 'lastname']);
    expect(readName({ firstname: 'Amara', lastname: 'Osei' }, mapping)).toBe('Amara Osei');
  });

  it('falls back to the split columns when a whole-name cell is blank', () => {
    const mapping = guessMapping(['name', 'firstname', 'lastname']);
    expect(readName({ name: '', firstname: 'Ben', lastname: 'Osei' }, mapping)).toBe('Ben Osei');
  });
});

describe('a first import', () => {
  it('creates every guest', () => {
    expect(importFresh(SIMPLE).guests).toHaveLength(3);
  });

  it('leaves everyone unseated, rather than guessing', () => {
    expect(importFresh(SIMPLE).guests.every((g) => g.seat === null)).toBe(true);
  });

  it('creates a group per company, shared by its members', () => {
    const plan = importFresh(SIMPLE);
    expect(plan.groups).toHaveLength(2);

    const [amara, ben] = plan.guests;
    expect(amara?.groupId).toBe(ben?.groupId);
  });

  it('reads dietary and meal details', () => {
    const plan = importFresh(SIMPLE);
    const ben = plan.guests.find((g) => g.name === 'Ben Osei');
    expect(ben?.meal).toBe('Fish');
    expect(ben?.dietary).toBe('Shellfish allergy');
  });

  it('skips rows with no usable name', () => {
    const { headers, rows } = parseCsv('Name,Email\n,orphan@example.com\nAmara,a@example.com\n');
    const preview = previewImport(createSeatingPlan(), rows, guessMapping(headers));

    expect(preview.skippedRows).toBe(1);
    expect(preview.added).toBe(1);
  });

  it('collapses duplicate rows for the same person', () => {
    const csv = 'Name,Email\nAmara,a@example.com\nAmara,a@example.com\n';
    expect(importFresh(csv).guests).toHaveLength(1);
  });
});

describe('the source key', () => {
  it('prefers an explicit id column', () => {
    const mapping = guessMapping(['registrationid', 'email', 'name']);
    const key = sourceKeyFor({ registrationid: 'R-42', email: 'a@x.com', name: 'A' }, mapping);
    expect(key).toBe('id:r-42');
  });

  it('falls back to email', () => {
    const mapping = guessMapping(['email', 'name']);
    expect(sourceKeyFor({ email: 'A@X.com', name: 'A' }, mapping)).toBe('email:a@x.com');
  });

  it('falls back to the name, the weakest of the three', () => {
    const mapping = guessMapping(['name']);
    expect(sourceKeyFor({ name: 'Amara Osei' }, mapping)).toBe('name:amara osei');
  });
});

describe('re-importing an updated list', () => {
  // The promise from ADR-0013: a late guest-list update must not cost the
  // planner their seating.

  function seatedPlan(): SeatingPlan {
    let plan = importFresh(SIMPLE);
    plan = seatGuest(plan, plan.guests[0]!.id, { elementId: 't1', seatIndex: 0 });
    plan = seatGuest(plan, plan.guests[1]!.id, { elementId: 't1', seatIndex: 1 });
    plan = seatGuest(plan, plan.guests[2]!.id, { elementId: 't2', seatIndex: 0 });
    return plan;
  }

  const UPDATED = `Name,Email,Company,Meal,Dietary
Amara Osei,amara@example.com,Acme Catering,Chicken,
Ben Osei,ben@example.com,Acme Catering,Fish,Shellfish allergy
Priya Raman,priya@example.com,Raman Group,Vegetarian,
Nnamdi Achebe,nnamdi@example.com,Raman Group,Beef,
`;

  it('keeps everyone in their seat', () => {
    const before = seatedPlan();
    const { rows } = parseCsv(UPDATED);
    const { plan } = applyImport(before, rows, {
      mapping: guessMapping(parseCsv(UPDATED).headers),
      newId: counterIds(),
    });

    expect(guestsAt(plan, 't1')).toHaveLength(2);
    expect(guestsAt(plan, 't2')).toHaveLength(1);
  });

  it('applies changed details to a seated guest without moving them', () => {
    const before = seatedPlan();
    const amaraId = before.guests[0]!.id;
    const { rows, headers } = parseCsv(UPDATED);

    const { plan } = applyImport(before, rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    const amara = findGuest(plan, amaraId);
    expect(amara?.meal).toBe('Chicken');
    expect(amara?.seat).toEqual({ elementId: 't1', seatIndex: 0 });
  });

  it('adds a new guest, unseated', () => {
    const { rows, headers } = parseCsv(UPDATED);
    const { plan } = applyImport(seatedPlan(), rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    const nnamdi = plan.guests.find((g) => g.name === 'Nnamdi Achebe');
    expect(nnamdi).toBeDefined();
    expect(nnamdi?.seat).toBeNull();
  });

  it('keeps a guest missing from the new list, by default', () => {
    // A list exported with a filter applied would otherwise delete everyone
    // filtered out — losing real seating to a spreadsheet mistake.
    const shortened = 'Name,Email\nAmara Osei,amara@example.com\n';
    const { rows, headers } = parseCsv(shortened);

    const { plan } = applyImport(seatedPlan(), rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    expect(plan.guests).toHaveLength(3);
  });

  it('removes missing guests only when asked', () => {
    const shortened = 'Name,Email\nAmara Osei,amara@example.com\n';
    const { rows, headers } = parseCsv(shortened);

    const { plan } = applyImport(seatedPlan(), rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
      removeMissing: true,
    });

    expect(plan.guests).toHaveLength(1);
  });

  it('does not duplicate anyone', () => {
    const before = seatedPlan();
    const { rows, headers } = parseCsv(SIMPLE);
    const { plan } = applyImport(before, rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    expect(plan.guests).toHaveLength(3);
  });

  it('reuses the existing group rather than creating a second one', () => {
    const before = seatedPlan();
    const { rows, headers } = parseCsv(UPDATED);
    const { plan } = applyImport(before, rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    expect(plan.groups).toHaveLength(2);
  });
});

describe('the preview', () => {
  it('counts what would happen, without doing it', () => {
    const before = importFresh(SIMPLE);
    const { rows, headers } = parseCsv(
      'Name,Email,Meal\nAmara Osei,amara@example.com,Chicken\nNew Person,new@example.com,Beef\n'
    );

    const preview = previewImport(before, rows, guessMapping(headers));

    expect(preview.added).toBe(1);
    expect(preview.updated).toBe(1);
    expect(preview.removed).toBe(2);
    expect(before.guests).toHaveLength(3); // untouched
  });

  it('names the fields that changed', () => {
    const before = importFresh(SIMPLE);
    const { rows, headers } = parseCsv(
      'Name,Email,Company,Meal,Dietary\nAmara Osei,amara@example.com,Acme Catering,Chicken,\n'
    );

    const preview = previewImport(before, rows, guessMapping(headers));
    const update = preview.changes.find((c) => c.kind === 'update');
    expect(update?.changedFields).toEqual(['meal']);
  });

  it('reports unchanged guests as unchanged', () => {
    const before = importFresh(SIMPLE);
    const { rows, headers } = parseCsv(SIMPLE);

    const preview = previewImport(before, rows, guessMapping(headers));
    expect(preview.unchanged).toBe(3);
    expect(preview.updated).toBe(0);
  });

  it('flags departures that currently hold a seat, which are worth confirming', () => {
    let before = importFresh(SIMPLE);
    before = seatGuest(before, before.guests[2]!.id, { elementId: 't2', seatIndex: 0 });

    const { rows, headers } = parseCsv('Name,Email\nAmara Osei,amara@example.com\n');
    const preview = previewImport(before, rows, guessMapping(headers));

    expect(preview.removed).toBe(2);
    expect(preview.seatedRemovals).toBe(1);
  });
});

describe('importing while assignments are locked', () => {
  it('corrects details but adds nobody', () => {
    let before = importFresh(SIMPLE);
    before = { ...before, assignmentsLocked: true };

    const { rows, headers } = parseCsv(
      'Name,Email,Meal\nAmara Osei,amara@example.com,Chicken\nNew Person,new@example.com,Beef\n'
    );
    const { plan } = applyImport(before, rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    expect(plan.guests).toHaveLength(3);
    expect(plan.guests.find((g) => g.name === 'Amara Osei')?.meal).toBe('Chicken');
  });

  it('still reports in the preview what an unlocked import would do', () => {
    let before = importFresh(SIMPLE);
    before = { ...before, assignmentsLocked: true };

    const { rows, headers } = parseCsv('Name,Email\nNew Person,new@example.com\n');
    const { preview } = applyImport(before, rows, {
      mapping: guessMapping(headers),
      newId: counterIds(),
    });

    expect(preview.added).toBe(1);
  });
});
