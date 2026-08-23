# Templates and hitting a headcount

Source: `src/lib/templates/templates.ts`.

```ts
import { TEMPLATES, findTemplate } from '$lib/templates/templates';

const doc = findTemplate('wedding').create({ roomWidthMm: feet(70), name: 'Smith Wedding' });
```

`create(overrides?)` takes `Partial<TemplateOptions>` — `roomWidthMm`, `roomDepthMm`,
`name`, `unitSystem`. Anything omitted falls back to the template's own defaults.
Layouts scale to the room you pass rather than being fixed.

## Inventory

Every template at its **default size**, verified: all seven produce
**zero clearance violations and zero tight gaps**.

| id          | Default room | Seats | Tables | Seating element ids                             | Other ids                                |
| ----------- | ------------ | ----- | ------ | ----------------------------------------------- | ---------------------------------------- |
| `wedding`   | 60×40 ft     | 80    | 10     | `head`(8), `l1 l2`(8), `r1 r2`(8), `b1`–`b5`(8) | `room`, `dancefloor`, `bar`, `cake`      |
| `gala`      | 80×60 ft     | 210   | 21     | `t1`–`t21`(10)                                  | `room`, `stage`, `bar-left`, `bar-right` |
| `corporate` | 50×36 ft     | 64    | 8      | `t1`–`t8`(8)                                    | `room`, `screen`, `buffet`               |
| `theatre`   | 50×40 ft     | 160   | 2      | `bank-left`(80), `bank-right`(80)               | `room`, `stage`                          |
| `classroom` | 40×32 ft     | 27    | 9      | `d1`–`d9`(3)                                    | `room`, `screen`                         |
| `u-shape`   | 36×28 ft     | 11    | 3      | `u-head`(5), `u-left-1`(3), `u-right-1`(3)      | `room`, `screen`                         |
| `cabaret`   | 60×44 ft     | 90    | 15     | `t1`–`t15`(6)                                   | `room`, `stage`                          |

Ids are **stable and semantic** — that is what makes a template editable. `cake`
is a `rectTable` with no seats; every other "other" id is a `fixture` except
`room`.

Row prefixes in `wedding` mean left / right / back relative to the head table.
Resizing adds or drops tables in those rows, so `b1`–`b5` at 60×40 ft becomes
`b1`–`b12` at 70×45 ft.

**Templates ship descriptive labels already** — `Head table`, `Dancefloor`,
`Bar`, `Cake`, `Room`. Applying table numbering will overwrite them unless you
skip those elements (see below).

## Getting to a target headcount

Templates are parameterised by **room size, not headcount**. There is no
`seatsFor(120)`. The reliable loop is: create, measure with `totalSeats`, then
add or remove tables.

### Trimming down

Filter on **`seatCount(e) > 0`**, never on an id prefix. Ids are semantic, not a
namespace: `startsWith('b')` matches `b1`–`b5` in `wedding` **and the `bar`
fixture**, and in `gala` it matches only `bar-left` and `bar-right`. A prefix
filter will happily delete the bar and leave the tables.

```ts
let doc = findTemplate('wedding').create({ roomWidthMm: feet(70), roomDepthMm: feet(45) });
// 168 seats

const target = 120;
const droppable = doc.elements
  .filter((e) => seatCount(e) > 0 && !RESERVED.has(e.id))
  .map((e) => e.id)
  .reverse(); // last in draw order = furthest from the focal point

for (const id of droppable) {
  if (totalSeats(doc) <= target) break;
  doc = removeElement(doc, id);
}
// 120 seats, bar intact
```

Templates lay tables out from the focal point (head table, stage, screen)
outward, so reversing draw order drops the furthest tables first — which is the
order a planner drops them in. That rule holds for every template; row-prefix
ids are a `wedding` detail and nothing else.

### Topping up

```ts
const round = catalogItem('round-60');
doc = addElement(doc, round.create('extra-1', { x: feet(50), y: feet(34) }));
// 80 → 88 seats
```

You are responsible for placing an added table somewhere sensible. Run
`capacityReport` afterwards — nothing checks the position for you.

### Removing a table does not unseat its guests

`removeElement` only touches the document. Guests still hold `SeatRef`s pointing
at an element that no longer exists:

```
seated at l1 4
after removeElement, plan still claims 4 at l1
```

Fix it with `pruneAssignments`, which takes a **capacity map, not a document**,
and returns both the new plan and who was displaced:

```ts
const capacity = new Map(
  doc.elements.filter((e) => seatCount(e) > 0).map((e) => [e.id, seatCount(e)])
);
const { plan, orphaned } = pruneAssignments(seatedPlan, capacity);
// at l1: 0, orphaned: 4, unseated: 4
```

Orphaned guests are **unseated, not deleted** — a guest who quietly loses their
seat is worse than one who was never seated. Report `orphaned.length` rather
than swallowing it.

## Fixing a clearance violation

Resizing is what breaks clearance, not the templates themselves. The wedding
template at 70×45 ft packs in extra rows and produces four violations:

```
before 4  l3/b1  l4/b2  r3/b5  r4/b6
```

Each issue names the pair and the deficit (`gapMm` vs `requiredMm`), so the
remedy is to translate one of the pair apart until the gap clears. `moveElement`
takes a delta:

```ts
for (let pass = 0; pass < 6; pass++) {
  const issues = capacityReport(doc).issues;
  if (issues.length === 0) break;
  // Move the second element of each reported pair; the first is usually the
  // anchor row you want to leave alone.
  for (const id of new Set(issues.map((i) => i.between[1]))) {
    const el = doc.elements.find((e) => e.id === id);
    if (el) doc = replaceElement(doc, moveElement(el, { x: 0, y: feet(1) }));
  }
}
// after 0
```

Cap the passes. This is a nudge loop, not a solver — if it does not converge in
a handful of passes the room is genuinely too small for that table count, and
the honest fix is fewer tables, not more nudging.

`issues` includes both `'tight'` and `'violation'` severities. Filter on
`severity === 'violation'` if you only want to fix the ones that breach a
published minimum, and treat `'tight'` as a warning worth surfacing.

## Reserving the head table

`autoAssign` fills **every capacity you hand it**, in order. Derive capacities
with the naive `filter(seatCount > 0)` from recipe 4 and your first four guests
land at the head table — wrong for the flagship use case.

There is no "reserved" flag in the model. Exclude reserved tables yourself:

```ts
const RESERVED = new Set(['head']);

const tables: TableCapacity[] = doc.elements
  .filter((e) => seatCount(e) > 0 && !RESERVED.has(e.id))
  .map((e) => ({ elementId: e.id, seats: seatCount(e) }));

const result = autoAssign(plan, tables);
// capacities offered l1,l2,r1,r2,b1,b2,b3,b4,b5
// head holds 0
// l1 holds Ada Lovelace | Grace Hopper | Van Rijn, Rembrandt | Katsushika Hokusai
```

### Numbering around a reserved table

Do **not** reach for `numberingLabels` plus `startAt`. It assigns a number to
every seating element including the reserved one, so skipping that element
leaves a hole: on `gala` with `t1` reserved and `startAt: 2`, `t1` consumes the
number 2 and the surviving tables come out `T3`–`T12` — a plan whose lowest
table number is 3.

Filter the **order** instead, then index it yourself. `numberingOrder` returns
the ids in numbering sequence:

```ts
const order = numberingOrder(doc, DEFAULT_NUMBERING).filter((id) => !RESERVED.has(id));

order.forEach((id, i) => {
  const el = doc.elements.find((e) => e.id === id);
  if (el) doc = replaceElement(doc, updateElement(el, { label: 'T' + String(i + 1) }));
});
// gala: t1 keeps its own label; t2=T1 t3=T2 … t21=T20
```

This is template-agnostic and stays contiguous from 1 wherever the reserved
table falls in the order. Give the reserved table a real label of its own —
`updateElement(el, { label: 'Host table' })` — rather than leaving it blank.

The same applies to any sweetheart table, vendor table or reserved round: put
its id in `RESERVED`.

`gala`'s 21 tables are an undifferentiated grid — there is no `head`. Pick the
reserved table by **position**, not by id: `gala`'s stage sits at the top of the
room, so a host party belongs at a front table, not at whichever round happens
to be called `t1`. Read `elementPosition` to choose.

## Order of operations

Do it in this order and you never need to repair anything:

**trim → number → import → assign → export**

Removing or shrinking a table after guests are seated orphans their `SeatRef`s,
and you then owe a `pruneAssignments` pass. Numbering after assignment is
harmless; numbering after trimming is what keeps the numbers contiguous.
