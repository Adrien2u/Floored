# Guests and seating

Sources: `src/lib/seating/{guest,csv,import,assign,numbering}.ts`.

## The shape of it

The seating plan is a **top-level object beside the elements**, not part of them
(ADR-0013). A tool that only cares about geometry can ignore the `seating` key
entirely, and a file with no guests does not contain the key at all.

```ts
interface SeatingPlan {
  guests: readonly Guest[];
  groups: readonly Group[];
  separations: readonly Separation[];
  assignmentsLocked: boolean;
}
```

A seat is addressed as `SeatRef { elementId, seatIndex }` — a zero-based index
into the seats that element _generates_. Seats are never stored (ADR-0012), so
`seatIndex` 3 at `t-1` is a position computed from the table, not a record.
Shrinking a table's `seats` count can therefore orphan assignments: call
`pruneAssignments` after any edit that reduces capacity, including deleting a
table — see the worked example in `templates.md`.

### Guest

```ts
{
  id, name, email,
  groupId: GroupId | null,
  isHost: boolean,        // host sits first; their seat decides where the group goes
  seat: SeatRef | null,   // null means unseated
  meal, dietary,
  accessibility,          // first-class: it decides where someone can physically sit
  notes,
  sourceKey,              // stable key from the source data, for re-import matching
}
```

`accessibility` is a real field rather than free-text notes because it is the
same conversation as the ADA clearances the plan already checks.

`sourceKey` is what keeps "Kate Brown" seated after she becomes "Kate Brown-Smith".

## Serializing

```ts
serialize(doc); // no seating key at all
serialize(doc, plan); // seating included
const result = parse(text);
if (result.ok) {
  result.document;
  result.seating;
}
```

## Mutators — all pure

`createSeatingPlan()`, `createGuest(id, name, overrides?)`.

| Function                                                             | Does                                                                                                                                                                               |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seatGuest(plan, guestId, seatRef)`                                  | Place a guest.                                                                                                                                                                     |
| `swapSeats(plan, a, b)`                                              | Exchange two guests' seats.                                                                                                                                                        |
| `unseatGuest(plan, guestId)`                                         | Remove from their seat.                                                                                                                                                            |
| `clearTable(plan, elementId)`                                        | Unseat everyone at a table.                                                                                                                                                        |
| `moveTableGuests(plan, fromId, toId)`                                | Move a whole table's guests.                                                                                                                                                       |
| `pruneAssignments(plan, capacityMap)`                                | Drop assignments to seats that no longer exist. Takes a `ReadonlyMap<ElementId, number>`, **not a document**, and returns `{ plan, orphaned }`. Orphans are unseated, not deleted. |
| `addSeparation(plan, a, b, reason)` / `removeSeparation(plan, a, b)` | Keep two people apart.                                                                                                                                                             |

## Queries

`guestsAt(plan, elementId)`, `guestInSeat(plan, ref)`, `unseatedGuests(plan)`,
`seatedCount(plan)`, `groupMembers(plan, groupId)`, `groupHost(plan, groupId)`,
`groupsAt(plan, elementId)`, `areSeparated(plan, a, b)`, `seatingConflicts(plan)`.

`seatingConflicts` is the one to run before shipping: it reports separated guests
who have ended up at the same table.

## CSV import

```ts
const { headers, rows } = parseCsv(text);
const mapping = guessMapping(headers);
if (!mappingIsUsable(mapping)) throw new Error('no name column');
```

`parseCsv` is hand-written: it strips Excel's UTF-8 BOM, honours quoted cells
containing commas, and skips blank rows. Headers are normalised — lowercased with
spaces, underscores, hyphens and punctuation removed — so `"First Name"` matches
`firstname`.

`guessMapping` matches known aliases per field. Recognised column names include:

| Field                    | Aliases                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `name`                   | name, fullname, guest, guestname, attendee, attendeename           |
| `firstName` / `lastName` | first, givenname, forename / last, surname, familyname             |
| `email`                  | email, emailaddress, mail                                          |
| `group`                  | group, company, organisation, party, table, household, org         |
| `host`                   | host, ishost, tablehost, primary, maincontact                      |
| `meal`                   | meal, mealchoice, entree, menu, food, course                       |
| `dietary`                | dietary, allergies, diet, dietaryrestrictions                      |
| `accessibility`          | accessibility, access, mobility, specialneeds                      |
| `notes`                  | notes, note, comments, remarks                                     |
| `key`                    | id, guestid, registrationid, confirmation, reference, submissionid |

Only a name is required. Override any field on the returned mapping before
applying if the guess is wrong.

### Preview, then apply

```ts
const preview = previewImport(plan, rows, mapping);
// { changes, added, updated, removed, unchanged, seatedRemovals, skippedRows }

const { plan: next } = applyImport(plan, rows, {
  mapping,
  newId: () => nextId(), // default is crypto.randomUUID()
  removeMissing: false, // default
});
```

`previewImport` touches nothing and describes exactly what `applyImport` would do.
Check `seatedRemovals` — those are departing guests who currently hold a seat, the
ones worth confirming before you destroy their assignment.

Three behaviours to rely on:

- **Seat assignments survive an update.** Matching is on `sourceKey`, and an
  updated guest keeps their seat. New guests arrive unseated, deliberately — the
  app does not know where they should sit.
- **`removeMissing` is off by default.** A filtered export would otherwise delete
  everyone the filter excluded.
- **`assignmentsLocked` blocks structural change.** With the lock on, an import
  corrects details only: nobody is added, removed or moved.

## Auto-assign

```ts
const tables: TableCapacity[] = doc.elements
  .filter((e) => seatCount(e) > 0)
  .map((e) => ({ elementId: e.id, seats: seatCount(e) }));

const result = autoAssign(plan, tables, { keepGroupsTogether: true });
// { plan, seated, unplaced: [{ guest, reason }], splitGroups }
```

`autoAssign` takes capacities, not a document — derive them as above. It fills
**empty seats only**; already-seated guests are left alone, so it is safe to run
after a partial manual pass.

Groups are placed largest first: the hardest thing to fit is fitted first, which
stops the last group of eight finding only scattered singles. `keepGroupsTogether`
defaults to `true` — a planner would rather be told a group does not fit than
discover half of it across the room. Read `unplaced` and `splitGroups`; a silent
`seated` count hides both failures.

`autoAssign` respects separations, and returns unchanged if `assignmentsLocked`.

## Table numbering

```ts
const labels = numberingLabels(doc, { ...DEFAULT_NUMBERING, pattern: 'snake', startAt: 2 });
// Map<ElementId, string> — e.g. t-1 => 'T2'
```

Labels are **computed, never stored**. To make them stick, turn the map into
element edits with `updateElement(el, { label })`.

Patterns: `leftToRight` (default), `rightToLeft`, `snake`, `reverseSnake`,
`columnMajor`. Options are `pattern`, `startAt` (venues reserving 1 for the head
table start at 2), `prefix` (default `T`), and `rowToleranceMm` — how far apart
two centres can sit vertically and still count as one row. The default of 1524 mm
is a table's own width, which groups a table nudged around a dancefloor with its
row while keeping genuinely separate rows apart. Rows are inferred, because a real
plan is never a perfect grid.
