# Catalog, clearance and capacity

Sources: `src/lib/catalog/catalog.ts`, `src/lib/catalog/capacity.ts`,
`src/lib/geometry/clearance.ts`.

## The catalog

```ts
import { CATALOG, catalogItem, catalogByCategory } from '$lib/catalog/catalog';

const item = catalogItem('round-60');
const element = item.create('t-1', { x: feet(12), y: feet(12) });
```

`create(id, at)` returns a fully-formed element with real dimensions and a
sensible seat count. Prefer it over hand-writing element literals — the catalog
is where the domain knowledge lives.

`catalogItem` returns `undefined` for an unknown id. Handle it.

### Every item

| id               | Name            | Category | Size              | Seats | Note                                      |
| ---------------- | --------------- | -------- | ----------------- | ----- | ----------------------------------------- |
| `round-48`       | Round 48″       | table    | 48″ ⌀             | 6     | Small rounds for tight rooms.             |
| `round-60`       | Round 60″       | table    | 60″ ⌀             | 8     | **The default.** 8 comfortably, 10 tight. |
| `round-72`       | Round 72″       | table    | 72″ ⌀             | 10    | Up to 12 tight.                           |
| `cocktail-36`    | Cocktail 36″    | table    | 36″ ⌀             | 4     | Standing height. No seated cover.         |
| `banquet-6`      | Banquet 6ft     | table    | 72×30″            | 6     | Or 8 with ends.                           |
| `banquet-8`      | Banquet 8ft     | table    | 96×30″            | 8     | Or 10 with ends.                          |
| `head-table`     | Head table 8ft  | table    | 96×30″            | 4     | One side only, facing the room.           |
| `ceremony-block` | Ceremony block  | seating  | 6 rows × 8 cols   | 48    | 22″ centres, 36″ rows.                    |
| `theatre-block`  | Theatre block   | seating  | 10 rows × 12 cols | 120   | Splits with an aisle.                     |
| `stage-20`       | Stage 20×5ft    | fixture  | 20×5 ft           | —     | Four 4×8 riser sections.                  |
| `dancefloor-16`  | Dancefloor 16ft | fixture  | 16×16 ft          | —     | 256 sq ft.                                |
| `bar-8`          | Bar 8ft         | fixture  | 8×2.5 ft          | —     | One bartender per 75 guests.              |
| `buffet-8`       | Buffet 8ft      | fixture  | 8×2.5 ft          | —     | One line per 100 guests.                  |
| `av-booth`       | AV / DJ         | fixture  | 8×4 ft            | —     | Allow cable run to stage.                 |
| `column`         | Column          | fixture  | 2×2 ft            | —     | Structural. Mark before laying out.       |

Seat counts are the **comfortable** figure, not the maximum. A plan built on the
tight count leaves no room for the chairs it also has to draw.

### Sizing advisors

```ts
suggestedDancefloorSideMm(120); // 4572 mm — a 15 ft square
suggestedBarCount(120); // 1
```

`suggestedDancefloorSideMm` assumes a third of guests dance at once at 4.5 sq ft
each, and rounds up to whole 3 ft panels. `suggestedBarCount` works from one
bartender per 75 guests, two per 8 ft station. Both are planning guides, not rules.

## Published clearance minimums

`CLEARANCE` in `$lib/geometry/clearance`, all in mm:

| Key                        | Value | Source                                                |
| -------------------------- | ----- | ----------------------------------------------------- |
| `adaAisleMin`              | 36″   | 2010 ADA Standards §403.5.1, minimum accessible route |
| `serviceAisle`             | 60″   | Staff with trays, and exit flow                       |
| `betweenTablesMin`         | 54″   | Minimum gap between round tables                      |
| `betweenTablesComfortable` | 60″   | Comfortable gap                                       |
| `betweenTablesGenerous`    | 72″   | Armed chairs or tall centrepieces                     |
| `adaKneeClearance`         | 27″   | Knee clearance beneath a table surface                |

Grading helpers: `gapBetweenCircles(a, rA, b, rB)`, `gradeTableGap(gapMm)`,
`gradeAisle(widthMm)`. Severity is `'ok' | 'tight' | 'violation'`.

## Occupant load

```ts
OCCUPANT_LOAD_SQ_FT = { unconcentrated: 15, concentrated: 7 }; // NFPA 101
occupantLoad(netAreaMm2, kind?);            // rounded DOWN — life safety
BANQUET_SQ_FT_PER_GUEST = { min: 10, comfortable: 12 };
seatingCapacityByArea(netAreaMm2, comfort?);
```

`occupantLoad` expects **net** floor area — corridors, stairs, restrooms and
mechanical rooms excluded. Passing gross area gives a number that is confidently
too high. It rounds down, deliberately: you may not round a life-safety limit up.

`seatingCapacityByArea` is for sizing a room _before_ any tables exist. Once
they do, count the seats.

## Checking a plan

```ts
import { capacityReport, clearanceIssues, overlappingPairs } from '$lib/catalog/capacity';

const rep = capacityReport(doc);
// { seats, tables, roomAreaSqFt, occupantLoad, overCapacity, issues }
```

`capacityReport` computes everything in one pass and is the single call worth
making before every export.

- `overCapacity` is `true` only when a room has been drawn and seats exceed the
  load. With no room the area is zero and every plan would otherwise look over.
- `issues` is `clearanceIssues(doc)`: `{ between, gapMm, requiredMm, severity, atMm }`.
- A **negative `gapMm` means physical overlap**, not a tight fit. Cross-check
  with `overlappingPairs(doc)`, which reports overlap in different words because
  it is a mistake rather than a trade-off.

### The limit you need to know

**`clearanceIssues` only checks round table against round table.** Rectangular
tables, fixtures and seating blocks have orientation, so the shortest distance
between them is a polygon-distance problem, and the module reports nothing rather
than reporting a wrong warning.

So: a plan of banquet rectangles can come back with zero issues and still be
unwalkable. For those, compare `elementBounds` yourself, or lay them out on a
grid with `CLEARANCE.serviceAisle` between rows by construction.

`overlappingPairs` covers all solid elements (everything except rooms and notes),
using circle geometry for round-vs-round and bounds elsewhere.
