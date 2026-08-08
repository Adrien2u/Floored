# ADR-0003 — Plain document model, immutable updates, command-stack undo

**Status:** Accepted · 2026-08-08

## Context

The document is the source of truth for the renderer, the exporter, and the file
format simultaneously. Undo must feel trustworthy: an undo stack that restores
things the user did not think of as actions feels haunted and destroys confidence
faster than a missing feature.

## Decision

**Document.** Plain serializable objects. Every element has a stable `id`, a
`type`, and geometry in integer millimetres
([ADR-0006](ADR-0006-units-and-coordinates.md)). No classes, no framework types,
no renderer state — the document must serialize with `JSON.stringify` and mean
the same thing to the PDF exporter as to the screen.

**Updates.** Immutable. A mutation produces a new element object with overrides
applied, following Excalidraw's `newElementWith` pattern. Cheap change detection,
trivial history, no aliasing bugs.

**Undo.** A command stack of semantic operations with forward and inverse forms —
"move these 4 ids by (dx, dy)", not a whole-document snapshot. Snapshots are
simpler but balloon at 2,000 objects.

**Explicitly not undoable**, decided now rather than discovered later:

- viewport pan and zoom
- selection changes
- panel open/closed state
- active tool

Ctrl+Z after moving a table must move the table back — not restore a scroll
position from four actions ago.

## Rejected alternatives

| Option                         | Why not                                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Snapshot undo                  | Memory cost scales with document size × history depth.                                               |
| CRDT (Yjs) now                 | Solves multi-user editing, which is out of scope and has no server to sync through. Pure cost today. |
| Mutable model with dirty flags | Faster to write, and the source of the aliasing bugs that make undo untrustworthy.                   |

## Consequences

- Every operation must define its inverse. Operations whose inverse is awkward
  (auto-assign seating) are modelled as one coarse command, not many fine ones.
- The operation log is deliberately CRDT-shaped. A future Yjs port would be an
  addition, not a rewrite.
- Serialization is nearly free, since the in-memory shape _is_ the file shape.

## Reverse if

Real-time collaboration is committed to as a shipping feature, at which point
the operation log migrates to a CRDT rather than being replaced.
