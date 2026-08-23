# Data model

Source: `src/lib/document/element.ts`, `src/lib/document/document.ts`.
Barrel: `import { ... } from '$lib/document'`.

Everything is a plain readonly object. The in-memory shape **is** the file shape —
there is no serialization layer to translate through, which is why `serialize()`
is a canonical `JSON.stringify` and nothing more.

## Coordinates and units

- Integer millimetres everywhere (ADR-0006). `+x` is right, `+y` is **down**.
- Build dimensions with `feet()` / `inches()` from `$lib/geometry/units`, which
  round to integer mm for you. Never write a raw float into geometry.
- `unitSystem` on the document affects **display and export only**. Switching a
  plan from imperial to metric changes no stored coordinate.
- `formatLength(mm, system)` → `12'` or `3.658 m`. `parseLength(input, system)`
  reads user text back to mm.

## The document

```ts
interface DocumentMeta {
  name: string;
  eventDate: string;
  notes: string;
  unitSystem: 'imperial' | 'metric';
}

interface FlooredDocument {
  schemaVersion: number; // CURRENT_SCHEMA_VERSION === 3
  meta: DocumentMeta;
  layers: readonly string[]; // DEFAULT_LAYERS: room, furniture, annotations
  elements: readonly FloorElement[];
}
```

`createDocument(meta?)` takes a partial meta and fills the rest.

Element order in the array is **draw order** — later elements paint on top. This
is why `insertElement` takes a concrete index and why the undo system records
indices rather than "append".

## Elements

Shared by all of them:

```ts
id: ElementId; // opaque string, yours to choose; must be unique
layer: string; // one of doc.layers
rotationDeg: number; // clockwise, about the element's own anchor
locked: boolean;
label: string;
```

| Type           | Anchor                                    | Own fields                                                                 |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------- |
| `room`         | —                                         | `points: readonly Point[]` — closed polygon, do not repeat the first point |
| `roundTable`   | **`center`**                              | `diameterMm`, `seats`                                                      |
| `rectTable`    | **`origin`** = top-left _before rotation_ | `widthMm`, `depthMm`, `seats`                                              |
| `fixture`      | `origin` (top-left, pre-rotation)         | `kind`, `widthMm`, `depthMm`                                               |
| `seatingBlock` | `origin` (top-left, pre-rotation)         | `rows`, `columns`, `seatPitchMm`, `rowPitchMm`                             |
| `note`         | `origin`                                  | `text`                                                                     |

**The anchor difference is the most common mistake.** A round table is positioned
by its centre; everything else is positioned by its top-left corner before
rotation is applied. Placing a rect table "at" a point puts its corner there, not
its middle.

`FixtureKind` is `'stage' | 'dancefloor' | 'bar' | 'buffet' | 'av' | 'column' | 'other'`.

A document may hold **several rooms** — a foyer plus a ballroom. `roomAreaMm2`
sums them.

### Seating blocks generate their chairs

A `seatingBlock` is `rows × columns` chairs described in five numbers (ADR-0012).
A 3,500-seat theatre layout is a handful of blocks, not 3,500 elements. Individual
chairs are never stored and cannot be addressed as elements — only as seat indices.

## Helpers — use these, do not recompute

From `$lib/document`:

| Function                                                | Does                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `seatCount(element)`                                    | Seats this element provides. `0` for rooms, fixtures, notes.                                        |
| `seatingBlockSize(block)`                               | Overall footprint of a block.                                                                       |
| `elementBounds(element)`                                | Rotation-aware axis-aligned bounding box.                                                           |
| `elementPosition(element)`                              | The anchor point, whichever kind it is.                                                             |
| `moveElement(element, delta)`                           | New element shifted by a **delta**, not moved to a destination.                                     |
| `rotateElement(element, deg)`                           | New element at a new rotation.                                                                      |
| `updateElement(element, patch)`                         | New element with fields replaced.                                                                   |
| `findElement(doc, id)` / `indexOfElement(doc, id)`      | Lookup.                                                                                             |
| `addElement(doc, el)` / `insertElement(doc, el, index)` | New document with the element added.                                                                |
| `removeElement(doc, id)`                                | New document without that element. **Does not unseat its guests** — follow with `pruneAssignments`. |
| `replaceElement(doc, el)`                               | New document with the same-id element swapped.                                                      |
| `updateMeta(doc, patch)`                                | New document.                                                                                       |
| `totalSeats(doc)`                                       | Sum across every seating element.                                                                   |
| `documentBounds(doc)`                                   | Extent of the whole plan — what the exporters fit to.                                               |
| `roomAreaMm2(doc)`                                      | Net polygon area of all rooms.                                                                      |

`SEAT_SIZE_MM` is 457 (18″). `elementBounds` must never under-report, or an
element becomes unclickable in the editor — do not "optimise" it.

## Purity

Every one of the above returns a new object. Nothing mutates. The idiomatic shape
is reassignment:

```ts
let doc = createDocument({ name: 'Event' });
doc = addElement(doc, table);
doc = replaceElement(doc, updateElement(table, { label: 'T1' }));
```

`doc.elements.push(...)` will not compile against the readonly types, and
defeating that with a cast breaks undo, autosave and serialization at once.

## Commands and undo

Only relevant if you are driving the editor rather than authoring a file.
`src/lib/document/commands.ts` defines an invertible `Command` union
(`insert | remove | move | modify | meta | batch`); `history.ts` holds a 500-entry
stack. One user action equals one Ctrl+Z, which is why multi-element edits are
wrapped with `batch(label, commands)` — it returns `null` for an empty list and
the single command itself for a list of one.

For headless authoring you do not need commands at all: call the document
functions directly.

## Reading a `.floored` file without Floored

It is plain JSON with a canonical key order and 2-space indent, so saves diff
cleanly. The `seating` key is omitted entirely when there are no guests. Published
JSON Schemas live at `docs/schema/floored-v{1,2,3}.schema.json`; see
`docs/schema/README.md` for the compatibility contract.
