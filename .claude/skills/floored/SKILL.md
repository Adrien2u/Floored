---
name: floored
description: Author and edit Floored `.floored` documents programmatically — event floor plans and seating charts for weddings, banquets, galas, ceremonies and conferences. Use when asked to build a floor plan, lay out tables, produce a seating chart, import a guest list, seat guests, check clearance or capacity, or export a to-scale plan PDF, SVG or day-of pack from this repository.
---

# Authoring Floored plans programmatically

Floored is a local-first **event seating planner**. It is not CAD or BIM: there are
no walls, doors, windows, levels, or units. A room is one closed polygon, and the
objects that matter are tables, fixtures, seating blocks, notes, and a guest list.

Everything in `src/lib/` is pure and DOM-free, so a plan can be built, edited,
checked and exported entirely headlessly. This skill is about doing that. It is
not about contributing to the app — for that, read `docs/ARCHITECTURE.md` and
`docs/STRUCTURE.md`.

## The runner (read this first)

**`src/lib` cannot be run by plain `node`.** Imports use the `$lib` path alias,
which is defined only in `vite.config.ts`, and relative imports are extensionless.
There is no `tsx` and no `ts-node`.

**Vitest is the runner.** It inherits the alias config and runs `environment: 'node'`.
Write your script as a spec under `src/`, then:

```bash
npx vitest run src/scratch/my-plan.test.ts
```

Any path matching `src/**/*.test.ts` is picked up. Use `node:fs` directly to write
output — the test environment is Node, with full filesystem access.

Do not add a runner dependency. Floored ships with **zero runtime dependencies**
and that is a deliberate, documented position (ADR-0010).

Minimum viable script:

```ts
import { describe, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createDocument, addElement, serialize } from '$lib/document';
import { catalogItem } from '$lib/catalog/catalog';
import { exportPlanPdf } from '$lib/export/plan-pdf';
import { feet } from '$lib/geometry/units';

describe('build a plan', () => {
  it('writes the files', () => {
    let doc = createDocument({ name: 'My Event', unitSystem: 'imperial' });
    doc = addElement(doc, {
      id: 'room-1',
      type: 'room',
      layer: 'room',
      rotationDeg: 0,
      locked: false,
      label: 'Ballroom',
      points: [
        { x: 0, y: 0 },
        { x: feet(60), y: 0 },
        { x: feet(60), y: feet(40) },
        { x: 0, y: feet(40) },
      ],
    });
    const round = catalogItem('round-60');
    if (round) doc = addElement(doc, round.create('t-1', { x: feet(12), y: feet(12) }));

    writeFileSync('out/plan.floored', serialize(doc), 'utf8');
    writeFileSync('out/plan.pdf', exportPlanPdf(doc).pdf, 'latin1');
  });
});
```

Two things that will bite you if you skip them:

- **`exportPlanPdf().pdf` is a `string`, not bytes.** Write it with the `latin1`
  encoding. Writing it as `utf8` corrupts the file.
- **`src/lib/export/download.ts` is browser-only.** `savePdf`, `saveDocument` and
  friends touch the DOM. Headless scripts call the `export*` functions and write
  the result themselves.

## Three rules you must not break

1. **All geometry is integer millimetres** (ADR-0006). Build every dimension with
   `feet()` / `inches()` from `$lib/geometry/units`; never write a raw float.
   Display units are presentation only — `formatLength()` / `parseLength()`.
2. **Documents are immutable.** `addElement`, `moveElement`, `updateElement`,
   `seatGuest` and every sibling **return a new object**. `doc.elements.push(...)`
   is always a bug.
3. **Never edit a released schema or migration.** `docs/schema/floored-v{1,2,3}.schema.json`
   are frozen contracts, and `src/lib/document/migration.test.ts` is the
   compatibility guarantee.

## Which reference to read

| You are doing                                                       | Read                                 |
| ------------------------------------------------------------------- | ------------------------------------ |
| Anything — start here for working scripts                           | `references/authoring-recipes.md`    |
| Picking a template, hitting a headcount, reserving the head table   | `references/templates.md`            |
| Constructing or editing elements by hand                            | `references/data-model.md`           |
| Picking furniture, sizing a dancefloor, checking a plan is walkable | `references/catalog-and-capacity.md` |
| Guest lists, CSV import, seating, table numbering                   | `references/seating-and-guests.md`   |
| PDF, SVG, day-of pack, drawing scales                               | `references/export.md`               |
| Changing library code rather than authoring a plan                  | `references/invariants.md`           |

## The shortest path to a good plan

Start from a template, don't hand-build geometry. `findTemplate('wedding').create({...})`
gives a room, a head table, a dancefloor, rounds, bars and a cake table already
laid out to real clearances — then edit it. Seven templates exist: `wedding`,
`gala`, `corporate`, `theatre`, `classroom`, `u-shape`, `cabaret`.

Every template is clearance-clean at its **default** room size. Resizing is what
breaks clearance, so if you change the room, check the result.

Templates are parameterised by room dimensions, **not headcount**. To hit a target
guest count, create, measure with `totalSeats(doc)`, then add or remove tables —
`references/templates.md` has the element ids and the loop.

Two traps worth knowing before you start:

- **`tests/fixtures/guests.csv` holds 4 guests.** It is a smoke-test fixture, not
  a realistic list. Asked for a 120-guest chart, you need 120 guests from
  somewhere — say so rather than shipping a plan with four people in it.
- **`autoAssign` fills every table you offer it, head table included.** Exclude
  reserved tables when you build the capacity list.

Then always run `capacityReport(doc)` before you export. Clearance is advisory —
nothing stops you placing tables 6 inches apart, and a plan that never got checked
is a plan the venue cannot walk.
