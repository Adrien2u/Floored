# Project structure

Organised by **domain**, not by file type. A directory is a capability, and you
should be able to answer three questions about each one: what does it do, how do
you use it, and what does it depend on.

## Dependency rule

Dependencies point **inward and downward only**. Nothing below may import from
anything above it.

```
  src/ui/          Svelte components — panels, dialogs, menus
       │           may import anything in lib/
       ▼
  src/lib/tools/       interaction: select, move, rotate, draw
  src/lib/render/      canvas drawing, culling, hit-testing
  src/lib/export/      PDF / PNG / SVG output
  src/lib/seating/     guest list, assignment, constraints
  src/lib/catalog/     object library with real-world defaults
       │
       ▼
  src/lib/document/    element model, undo, serialization
       │
       ▼
  src/lib/geometry/    pure maths. imports nothing.
```

**`geometry/` imports nothing and touches no DOM.** That is what makes it
testable in isolation and reusable by both the screen renderer and the PDF
exporter — the property the to-scale print requirement depends on.

## Directories

| Path                   | Contains                                                                   | Phase   |
| ---------------------- | -------------------------------------------------------------------------- | ------- |
| `src/lib/geometry/`    | Units, vectors, transforms, polygons, snapping, clearance. Pure functions. | 1       |
| `src/lib/document/`    | Element schema, immutable updates, undo stack, `.floored` serialization    | 2       |
| `src/lib/persistence/` | OPFS storage, autosave, crash recovery, file open/save                     | 2       |
| `src/lib/render/`      | Dual-canvas renderer, viewport, culling, hit-testing                       | 3       |
| `src/lib/tools/`       | Selection, and drag/rotate/arrange as pure state machines                  | 4       |
| `src/lib/catalog/`     | Table/chair/stage definitions with verified real dimensions                | 5       |
| `src/lib/export/`      | Scale projection, vector PDF writer, PNG, SVG                              | 1, 6    |
| `src/lib/seating/`     | Guest model, import, assignment, constraint solving                        | 7       |
| `src/ui/`              | Svelte components. Presentation only — no domain logic.                    | 3+      |
| `tests/e2e/`           | Playwright specs                                                           | 4+      |
| `tests/fixtures/`      | Sample `.floored` files, one per released schema version                   | 2+      |
| `docs/`                | Everything in [README](../README.md#documentation)                         | ongoing |
| `scripts/`             | Build and CI helpers                                                       | 0       |

Directories appear when their phase begins. Empty scaffolding is not created in
advance — a directory that exists implies content that works.

## File conventions

- **Unit tests are colocated**: `units.ts` is tested by `units.test.ts` beside
  it. End-to-end tests live in `tests/e2e/` because they cross every boundary.
- **`index.ts` re-exports only.** No logic, so it is excluded from coverage.
- **Files stay under ~300 lines.** Past that, the file is doing two jobs; split
  it along the seam.
- **Path aliases**: `$lib/*` and `$ui/*`. No `../../..` chains.

## Naming

| Thing                   | Convention       | Example                  |
| ----------------------- | ---------------- | ------------------------ |
| Files                   | kebab-case       | `point-in-polygon.ts`    |
| Svelte components       | PascalCase       | `GuestListPanel.svelte`  |
| Types and interfaces    | PascalCase       | `FloorElement`           |
| Functions and variables | camelCase        | `formatLength`           |
| Constants               | UPPER_SNAKE_CASE | `MM_PER_INCH`            |
| Millimetre quantities   | suffix `Mm`      | `widthMm`, `clearanceMm` |

That last one is not decoration. Every internal length is integer millimetres
([ADR-0006](adr/ADR-0006-units-and-coordinates.md)); the suffix makes a unit
mistake visible at the call site rather than in a misprinted floor plan.
