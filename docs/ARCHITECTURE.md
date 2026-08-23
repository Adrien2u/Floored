# Architecture

How Floored fits together, and why it is shaped this way. For _where files live_,
see [STRUCTURE.md](STRUCTURE.md). For individual decisions and their reasoning,
see [adr/](adr/).

## The one idea

**The document is the source of truth, in integer millimetres, and everything
else is a projection of it.**

```
                    ┌──────────────────────────┐
                    │   document (integer mm)  │
                    │  elements · guests ·     │
                    │  constraints · metadata  │
                    └────────────┬─────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
      mmToScreen()        mmToPdfPoints()      JSON.stringify
              │                  │                  │
              ▼                  ▼                  ▼
      canvas renderer      PDF / SVG export     .floored file
```

Two projection functions exist, and only two. A third is a bug.

This is what makes the ruler test achievable: the PDF is not a picture of the
screen, it is a second independent rendering of the same millimetre truth. It is
also what makes the renderer replaceable — swapping Canvas2D for WebGL would
change one arrow on that diagram and nothing else.

## Layers

```
  ui/          Svelte. Renders and reads. Computes nothing.
   │
   ├─ tools/       pointer state machines: select, move, rotate, draw
   ├─ render/      dual canvas, viewport, bounds scan, culling, hit-testing
   ├─ export/      hand-written PDF writer, PNG, SVG
   ├─ seating/     guest model, assignment, constraint solving
   ├─ catalog/     object definitions with verified real dimensions
   │
   ├─ document/    element model, immutable updates, undo, serialization
   │
   └─ geometry/    pure maths. imports nothing. touches no DOM.
```

Dependencies point downward only. `geometry/` is the foundation precisely because
it depends on nothing — which is why both the screen renderer and the PDF
exporter can share it without either owning it.

## Rendering

Two stacked canvases ([ADR-0001](adr/ADR-0001-rendering.md)):

- **Static canvas** — the plan. Repaints only when the document or viewport
  changes, and then only dirty regions.
- **Interaction canvas** — selection handles, snap guides, drag previews,
  measurement overlay. Repaints freely; it is cheap and mostly empty.

Dragging a table repaints the small interaction canvas per frame and the static
canvas once, at drop. A linear bounds scan in `render/scene.ts` answers "what is
under the pointer" and "what is in view". No spatial index was needed at the
element counts this app reaches — see the amendment on
[ADR-0001](adr/ADR-0001-rendering.md) — and `scene.bench.test.ts` fails CI on the
day that stops being true.

## State

| Kind                          | Lives in | Undoable |
| ----------------------------- | -------- | -------- |
| Elements, guests, constraints | document | yes      |
| Viewport pan and zoom         | session  | no       |
| Selection                     | session  | no       |
| Active tool, panel state      | session  | no       |
| Autosave snapshot             | OPFS     | n/a      |

The undoable/not-undoable split is decided up front, not discovered. Ctrl+Z after
moving a table moves the table back — it does not restore a scroll position from
four actions ago.

## Data flow for one edit

1. Pointer event reaches the active tool.
2. Tool computes new geometry via `geometry/` — pure functions, no side effects.
3. Tool emits a **command** with forward and inverse forms.
4. Document applies it, producing new immutable element objects.
5. Culling and hit-testing read the changed elements' new bounds.
6. Renderer repaints the affected region.
7. Autosave debounces, then writes to OPFS.

Export and file save read step 4's output directly. They never observe steps 5–7.

## Why there is no server

A floor plan is a small document edited by one person. Accounts, sync, and
storage are costs the incumbents chose, and they are the costs they monetize.
Removing the server removes the recurring cost, which is what lets the paywalled
feature set be the free feature set permanently.

Consequences accepted deliberately: no real-time collaboration in 1.0, sharing is
link-encoded ([ADR-0009](adr/ADR-0009-sharing.md)), and the browser's storage is
treated as volatile with a loud prompt to save real files
([ADR-0005](adr/ADR-0005-persistence.md)).

## Performance budget

Enforced in CI, not aspirational:

| Metric                 | Budget                            |
| ---------------------- | --------------------------------- |
| JS bundle              | < 400 KB gzipped                  |
| CSS bundle             | < 50 KB gzipped                   |
| Pan/zoom               | 60 fps at target object count     |
| Interaction latency    | < 50 ms                           |
| First contentful paint | < 1.5 s, cold cache               |
| Offline                | fully functional after first load |

## Gestures are state machines, not event handlers

Every editing gesture — drag, rotate, marquee — is a pure triple:

```
begin(document, selection, point)  ->  State | null
update(state, document, point, options)  ->  State
commit(state)  ->  Command | null
```

No DOM, no pointer, no canvas. The pointer handlers in `PlanCanvas.svelte` are a
thin shell that calls these three functions and stores the result.

Two reasons this shape was chosen over handling events directly:

**It makes the hard parts testable.** Snapping, alignment guides, locked
elements, rotation drift, and "a drag that ends where it started" are all
ordinary unit tests. ADR-0001 named the interaction surface as the renderer's
second-biggest risk — roughly two weeks of pointer-event work where bugs hide and
polish dies. Moving that logic out of the event handlers is the mitigation.

**`null` is a real answer.** `begin` returns null when nothing movable is
selected, so a gesture that could not do anything never starts. `commit` returns
null when nothing changed, so a click that wobbles a pixel never lands on the
undo stack. Everything a user can undo is something they meant to do.

The gesture in progress is a single discriminated union rather than several
booleans:

```ts
type Gesture =
  | { kind: 'none' }
  | { kind: 'pan'; lastPx: Point }
  | { kind: 'drag'; state: DragState }
  | { kind: 'marquee'; startMm: Point; rect: Rect };
```

A pointer can only be doing one thing at a time, and encoding that in the type
removes every "is it panning _and_ dragging?" question before it can be asked.

## One user action is one undo

Aligning eight tables produces eight move commands, and must still cost one press
of Ctrl+Z. A `batch` command holds sub-commands, applies them in order, and
inverts them in reverse order — the reversal matters, because a batch that
removed elements front-to-back has to re-insert them back-to-front or the
captured draw-order indices no longer line up.

`batch` returns `null` for an empty list and the command itself for a list of
one, so the history never holds a wrapper around nothing.
