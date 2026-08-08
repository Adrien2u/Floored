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
   ├─ render/      dual canvas, viewport, rbush, culling, hit-testing
   ├─ export/      pdf-lib vector pipeline, PNG, SVG
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
canvas once, at drop. `rbush` answers "what is under the pointer" and "what is in
view" without scanning every element.

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
5. rbush index updates for the changed ids only.
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
