# Authoring recipes

Every script here was executed against this repository before it was written down.
The console output quoted under each one is real.

Run any of them with:

```bash
npx vitest run src/scratch/<name>.test.ts
```

Wrap the body in `describe`/`it` — Vitest is the runner, so the file has to look
like a spec. The assertions are worth keeping: they are what tells you the plan
came out the size you meant.

The recipes below write to an `out/` directory relative to the repository root.
Create it once at the top of your script — `node:fs` will not make it for you:

```ts
import { mkdirSync } from 'node:fs';
mkdirSync('out', { recursive: true });
```

---

## 1. Build a plan from scratch

A room polygon plus catalog furniture. Catalog items carry their own real-world
dimensions and seat counts, so `item.create(id, at)` is nearly always better than
writing a `roundTable` literal by hand.

```ts
import { describe, it, expect } from 'vitest';
import { createDocument, addElement, totalSeats } from '$lib/document';
import { catalogItem } from '$lib/catalog/catalog';
import { capacityReport } from '$lib/catalog/capacity';
import { feet } from '$lib/geometry/units';

describe('build from scratch', () => {
  it('room + catalog tables + fixture', () => {
    let doc = createDocument({ name: 'Recipe 1', unitSystem: 'imperial' });

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

    const round60 = catalogItem('round-60');
    if (!round60) return;

    let n = 0;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        n++;
        doc = addElement(
          doc,
          round60.create('t-' + String(n), {
            x: feet(12 + col * 14),
            y: feet(12 + row * 14),
          })
        );
      }
    }

    const df = catalogItem('dancefloor-16');
    if (df) doc = addElement(doc, df.create('df', { x: feet(24), y: feet(2) }));

    const rep = capacityReport(doc);
    console.log('seats', totalSeats(doc), 'elements', doc.elements.length);
    console.log('sqft', rep.roomAreaSqFt, 'load', rep.occupantLoad, 'over', rep.overCapacity);
    expect(totalSeats(doc)).toBe(48);
  });
});
```

Real output:

```
seats 48 elements 8
sqft 2400 load 160 over false
```

Note the room polygon is wound clockwise in screen coordinates (+x right, +y down)
and is closed implicitly — do not repeat the first point at the end.

---

## 2. Start from a template, then edit

Usually the right opening move. Each template lays itself out around the room
dimensions you pass, respecting real clearances.

```ts
import { describe, it, expect } from 'vitest';
import { findTemplate, TEMPLATES } from '$lib/templates/templates';
import { capacityReport } from '$lib/catalog/capacity';
import { feet } from '$lib/geometry/units';

describe('from template', () => {
  it('creates and resizes', () => {
    console.log('ids', TEMPLATES.map((t) => t.id).join(','));

    const t = findTemplate('wedding');
    if (!t) return;

    const doc = t.create({
      roomWidthMm: feet(70),
      roomDepthMm: feet(45),
      name: 'Smith Wedding',
    });

    const rep = capacityReport(doc);
    console.log('seats', rep.seats, 'tables', rep.tables, 'sqft', rep.roomAreaSqFt);
    console.log('clearance issues', rep.issues.length);
    expect(rep.seats).toBeGreaterThan(0);
  });
});
```

Real output:

```
ids wedding,gala,corporate,theatre,classroom,u-shape,cabaret
seats 168 tables 21 sqft 3150
clearance issues 4
```

**Read that last line.** All seven templates are clearance-clean at their
**default** size — resizing is what breaks it. The wedding template at 70×45 ft
packs in extra rows and produces four violations. So: if you keep the default
room, you are fine; if you resize, check and fix.

`references/templates.md` has every template's element ids, seat counts and
default size, plus a worked example of fixing a violation by translating a row.

`create()` takes `Partial<TemplateOptions>`; anything you omit falls back to that
template's own defaults (`roomWidthMm`, `roomDepthMm`, `name`, `unitSystem`).

---

## 3. Load, edit, save an existing `.floored`

`parse()` returns a discriminated result — check `.ok` before touching
`.document`. Older files are migrated forward automatically on load.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parse, serialize, replaceElement, updateElement, moveElement } from '$lib/document';
import { feet } from '$lib/geometry/units';

describe('load, edit, save', () => {
  it('round-trips and edits', () => {
    const result = parse(readFileSync('tests/fixtures/v2-sample.floored', 'utf8'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    let doc = result.document;
    console.log('loaded schema v', doc.schemaVersion, 'elements', doc.elements.length);

    const first = doc.elements.find((e) => e.type === 'roundTable');
    if (first) {
      doc = replaceElement(doc, updateElement(first, { label: 'RENAMED' }));
      const moved = doc.elements.find((e) => e.id === first.id);
      if (moved) doc = replaceElement(doc, moveElement(moved, { x: feet(1), y: 0 }));
    }

    const out = serialize(doc);
    expect(parse(out).ok).toBe(true);
    writeFileSync('out/edited.floored', out, 'utf8');
  });
});
```

Real output:

```
loaded schema v 3 elements 3
```

A v2 file loads as `schemaVersion: 3` — migrations ran. Saving writes the current
version, so this is a one-way upgrade of that file.

`moveElement` takes a **delta**, not a destination. To set an absolute position,
read the current one with `elementPosition(element)` and subtract.

---

## 4. Import a guest CSV and auto-assign seats

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createDocument, addElement, serialize, parse, seatCount } from '$lib/document';
import { catalogItem } from '$lib/catalog/catalog';
import { parseCsv, guessMapping, mappingIsUsable } from '$lib/seating/csv';
import { previewImport, applyImport } from '$lib/seating/import';
import { createSeatingPlan, guestsAt } from '$lib/seating/guest';
import { autoAssign, type TableCapacity } from '$lib/seating/assign';
import { numberingLabels, DEFAULT_NUMBERING } from '$lib/seating/numbering';
import { feet } from '$lib/geometry/units';

describe('import and seat', () => {
  it('imports guests and seats them', () => {
    let doc = createDocument({ name: 'Recipe 4' });
    doc = addElement(doc, {
      id: 'room-1',
      type: 'room',
      layer: 'room',
      rotationDeg: 0,
      locked: false,
      label: '',
      points: [
        { x: 0, y: 0 },
        { x: feet(40), y: 0 },
        { x: feet(40), y: feet(30) },
        { x: 0, y: feet(30) },
      ],
    });

    const r60 = catalogItem('round-60');
    if (!r60) return;
    doc = addElement(doc, r60.create('t-1', { x: feet(10), y: feet(10) }));
    doc = addElement(doc, r60.create('t-2', { x: feet(26), y: feet(10) }));

    // NOTE: this fixture holds 4 guests. It is a smoke test, not a real list.
    const { headers, rows } = parseCsv(readFileSync('tests/fixtures/guests.csv', 'utf8'));
    const mapping = guessMapping(headers);
    console.log('headers', headers.join(','), 'usable', mappingIsUsable(mapping));

    // Always preview first — it tells you what applying would do, and changes nothing.
    const preview = previewImport(createSeatingPlan(), rows, mapping);
    console.log('added', preview.added, 'skipped rows', preview.skippedRows);

    // Inject ids so runs are reproducible; the default is crypto.randomUUID().
    let seq = 0;
    const { plan } = applyImport(createSeatingPlan(), rows, {
      mapping,
      newId: () => 'g-' + String(++seq),
    });
    console.log('guests', plan.guests.length, 'groups', plan.groups.length);

    // autoAssign needs capacities, not the document — derive them.
    const tables: TableCapacity[] = doc.elements
      .filter((e) => seatCount(e) > 0)
      .map((e) => ({ elementId: e.id, seats: seatCount(e) }));

    const assigned = autoAssign(plan, tables);
    console.log('seated', assigned.seated, 'unplaced', assigned.unplaced.length);
    console.log(
      'at t-1',
      guestsAt(assigned.plan, 't-1')
        .map((g) => g.name)
        .join(' | ')
    );
    expect(assigned.seated).toBe(plan.guests.length);

    // Table labels are computed, never stored. Apply them as element edits if wanted.
    const labels = numberingLabels(doc, DEFAULT_NUMBERING);
    console.log('labels', [...labels.entries()].map(([k, v]) => k + '=' + v).join(','));

    // The seating plan is the optional second argument to serialize().
    writeFileSync('out/r4.floored', serialize(doc, assigned.plan), 'utf8');
    const reread = parse(readFileSync('out/r4.floored', 'utf8'));
    if (reread.ok) console.log('seating survived', reread.seating?.guests.length);
  });
});
```

Real output:

```
headers name,email,group,dietary usable true
added 4 skipped rows 0
guests 4 groups 2
seated 4 unplaced 0
at t-1 Ada Lovelace | Grace Hopper | Van Rijn, Rembrandt | Katsushika Hokusai
labels t-1=T1,t-2=T2
seating survived 4
```

**`tests/fixtures/guests.csv` contains 4 guests.** It exists to exercise the
parser — quoted names, a blank cell, two groups — not to represent a real event.
If a task asks for N guests, get N guests from somewhere; do not wire up this
fixture and report success.

**`autoAssign` fills every capacity you hand it, in order.** The
`filter(seatCount > 0)` above offers _every_ seating element, so on a wedding
template the first guests land at the head table. Exclude reserved tables:

```ts
const RESERVED = new Set(['head']);
const tables = doc.elements
  .filter((e) => seatCount(e) > 0 && !RESERVED.has(e.id))
  .map((e) => ({ elementId: e.id, seats: seatCount(e) }));
```

Two behaviours worth knowing before you rely on them:

- `applyImport` **keeps seated guests in their seats**. It matches on `sourceKey`,
  so a renamed guest stays put. New guests arrive unseated.
- `removeMissing` is **off by default**. A filtered spreadsheet export would
  otherwise delete everyone who was filtered out.

---

## 5. Export

```ts
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { findTemplate } from '$lib/templates/templates';
import { exportPlanPdf } from '$lib/export/plan-pdf';
import { exportPlanSvg } from '$lib/export/plan-svg';
import { dayOfPackPdf } from '$lib/export/day-of';
import { SCALE, PAGE } from '$lib/export/projection';
import { createSeatingPlan } from '$lib/seating/guest';

describe('exports', () => {
  it('pdf, svg, day-of', () => {
    const t = findTemplate('wedding');
    if (!t) return;
    const doc = t.create({ name: 'Export Test' });
    const plan = createSeatingPlan(); // or a seated plan from recipe 4

    const pdf = exportPlanPdf(doc, { sheetTitle: 'Export Test', showSeats: true });
    console.log(pdf.scaleLabel, 'pages', pdf.pages, 'tiled', pdf.tiled, 'bytes', pdf.pdf.length);
    writeFileSync('out/plan.pdf', pdf.pdf, 'latin1'); // latin1, not utf8

    const quarter = exportPlanPdf(doc, { scale: SCALE.imperial1_4, page: PAGE.a4Landscape });
    console.log('quarter pages', quarter.pages, 'tiled', quarter.tiled);

    const svg = exportPlanSvg(doc, { showSeats: true });
    writeFileSync('out/plan.svg', svg, 'utf8');

    const pack = dayOfPackPdf(doc, plan, { eventName: 'Export Test' });
    writeFileSync('out/day-of.pdf', pack, 'latin1');
    expect(pack.length).toBeGreaterThan(2000);
  });
});
```

Real output:

```
1/8" = 1'-0" pages 1 tiled false bytes 25901
quarter pages 4 tiled true
```

Omitting `scale` picks the largest standard scale that fits one page. Forcing a
larger scale tiles across sheets rather than shrinking — see `references/export.md`
for why that trade is deliberate.

---

## Checking a plan before you ship it

```ts
import { capacityReport, clearanceIssues, overlappingPairs } from '$lib/catalog/capacity';

const rep = capacityReport(doc);
if (rep.overCapacity) throw new Error('seats exceed occupant load');
if (overlappingPairs(doc).length > 0) throw new Error('furniture overlaps');

for (const issue of clearanceIssues(doc)) {
  console.warn(issue.between.join(' / '), 'gap', issue.gapMm, 'needs', issue.requiredMm);
}
```

Real output from three deliberately overlapping 60″ rounds:

```
issues a/c gap=-1219 req=1372 violation ; a/b gap=-305 req=1372 violation
overlaps [["a","b"],["a","c"],["b","c"]]
```

A **negative `gapMm` means the tables overlap**, not merely that they are tight.
Treat that as a placement bug, and use `overlappingPairs` to confirm.

## Cleaning up

Scratch specs under `src/` are picked up by `npm run test`, and `npm run verify`
will fail on them if they are messy or left behind. Delete the scratch file when
the plan is produced, or keep it deliberately as a real test.

`out/` is **not** in `.gitignore`. It is outside the build and test globs so it
will not fail `verify`, but it will show as untracked in `git status`. Either
delete it once you have handed over the files, or write somewhere outside the
repository — the exports are deliverables, not source.
