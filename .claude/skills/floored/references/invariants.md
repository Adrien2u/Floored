# Invariants

Read this before changing library code rather than authoring a plan.

**If you are only authoring a `.floored` file, most of this does not apply to
you.** Rules 1 (integer millimetres) and the purity note are the two that bind
an author; the rest govern contributions to the library itself. They are here
so you can tell the difference, not as a checklist for every plan.

Each item here is actively enforced by a test — breaking one turns CI red, which
is the point.

## 1. Integer millimetres, always

All stored geometry is integer mm, `+x` right, `+y` down (ADR-0006). Build with
`feet()` / `inches()`, which round for you.

Display units are presentation only. `unitSystem` never changes a stored
coordinate; `formatLength` and `parseLength` handle the boundary. A float that
reaches an element field is a bug even when it looks harmless — it survives a
save, and the next reader gets a table 0.3 mm off grid.

Naming convention: any value in millimetres carries the `Mm` suffix
(`diameterMm`, `roomWidthMm`, `gapMm`). Follow it — the suffix is how a reviewer
tells a unit-carrying number from a count.

## 2. Exactly two projection functions

- `mmToScreen` — `src/lib/render/viewport.ts`
- `mmToPdfPoints` — `src/lib/export/projection.ts`

That is the complete list, and it stays complete. `mmToPdfPoints` is pinned by
the ruler test (`src/lib/export/ruler.test.ts`): if it drifts, every printed plan
is wrong and Floored's central claim — a plan you can measure with a scale rule —
becomes false.

Need page or screen coordinates somewhere new? Compose the existing function.
Never write a third.

## 3. Never edit a released schema or migration

`docs/schema/floored-v1.schema.json`, `-v2` and `-v3` are published contracts.
They are frozen the moment they ship, as are the migrations that produce them.

`src/lib/document/migration.test.ts` replays `tests/fixtures/v1-sample.floored`
and `v2-sample.floored` on every run. **That test is the backwards-compatibility
guarantee** — a file someone saved a year ago must still open.

Changing the format means a new version and a new migration, never an edit to an
old one. The four rules are in `docs/schema/README.md`.

## 4. Layering is inward-only

```
ui/ → tools | render | export | seating | catalog → document → geometry
```

`geometry/` imports nothing from the project and touches no DOM. Each layer may
import inward and downward, never outward or upward. Path aliases are `$lib/*`
and `$ui/*`.

## 5. `src/lib/**` must stay DOM-free

Vitest runs `environment: 'node'`. A `document` or `window` reference anywhere in
`src/lib` breaks the unit suite immediately.

The one deliberate exception is `src/lib/export/download.ts`, which is the browser
file-save sink and is only ever called from UI code.

## 6. Zero runtime dependencies

`package.json` has `devDependencies` only (ADR-0010). The PDF writer, PNG encoder,
CSV parser and service worker are all hand-rolled, and the bundle budget is
enforced by `npm run size` (currently ~48 KB gzipped against a 400 KB budget).

Adding a runtime dependency is an ADR-level decision, not an implementation
detail. Licences must be permissive and actually read. DWG is permanently out of
scope.

## 7. Other rules worth knowing

- **Seats are generated, never stored** (ADR-0012). A seating block is five
  numbers, not N chair elements.
- **Guests live in a top-level `seating` object** (ADR-0013), separate from
  elements and omitted entirely when empty.
- **Element array order is draw order.** Commands record concrete indices, never
  "append", so undo restores draw order exactly.
- **Session state is not undoable** — viewport, selection and panel state are
  deliberately excluded. The table is in `docs/ARCHITECTURE.md`.
- **`elementBounds` must never under-report.** An under-reported box makes an
  element unclickable.
- **Playwright workers are capped at 4 local / 2 CI on purpose.** Uncapped
  parallelism flaked roughly one run in three. Do not raise it.

## Verifying

```bash
npm run verify        # format:check, lint, typecheck, check, test, build, size
npx playwright test   # 3-browser e2e matrix
```

`npm run verify` is the gate CI runs. Note it includes `format:check`, which
covers markdown under Prettier — so documentation changes need `npm run format`
too, not just code.

Scratch specs left under `src/` are picked up by `npm run test`. Delete them, or
promote them into real tests.

## Where the reasoning lives

`docs/adr/` holds 13 accepted ADRs. Each records what was decided, what was
rejected, and — unusually and usefully — **what evidence would reverse it**. Read
the relevant one before arguing with an invariant; several have already been
amended in light of what shipped, and the amendment is part of the record.
