# ADR-0006 — Integer millimetres as the internal unit

**Status:** Accepted · 2026-08-08

## Context

Floored promises a printed plan that measures correctly with a ruler. That makes
the coordinate system load-bearing: every feature inherits it, and a coordinate
mistake surfaces as a misprinted floor plan at a venue, not as a stack trace.

Two failure modes have to be designed out:

1. **Float drift.** Repeated transforms (move, rotate, snap, group, ungroup)
   accumulate error in IEEE-754 doubles. A table nudged a hundred times must not
   land at 1524.0000000000002 mm.
2. **Unit ambiguity.** Mixing pixels, points, inches, and millimetres in one
   codebase produces silent, plausible, wrong output.

## Decision

**All internal geometry is integer millimetres.** One number, one meaning,
everywhere below the UI layer.

- Screen pixels and PDF points are both _derived projections_, computed at the
  edge, never stored.
- Display units (imperial feet-inches-fractions, or metric) are a formatting
  concern in the UI layer only.
- Every variable holding a millimetre value carries the `Mm` suffix, so a unit
  error is visible at the call site.

Sub-millimetre precision is not needed: no venue, tape measure, or banquet table
is specified tighter than a millimetre, and print output resolves far coarser.

## Rejected alternatives

| Option                        | Why not                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Floating-point millimetres    | Solves ambiguity, not drift. Snap and equality comparisons become epsilon-ridden.                                                |
| Pixels as the source of truth | Couples the document to zoom level and screen DPI. Makes to-scale PDF impossible without a reverse projection nobody can verify. |
| PDF points (1/72")            | Optimises for one output target and makes metric input lossy.                                                                    |
| Fixed-point decimal library   | Correct but adds a dependency and per-operation cost for precision nothing needs.                                                |

## Consequences

- Integer arithmetic throughout the geometry layer; rounding happens once, at
  the point a real-world measurement enters the document.
- Rotation produces non-integer intermediates. Rule: round to the nearest
  millimetre **once**, at the end of a complete gesture, not per animation frame
  — rounding per frame makes a slow drag walk the object.
- Two **coordinate projections** exist, and only two: `mmToScreen` and
  `mmToPdfPoints`. A third is a bug.

  This is a rule about sources of truth, not about output formats. An output
  conversion that _chains off_ one of the two is fine and expected: SVG export
  reuses the PDF projection (SVG user units map arbitrarily), and PNG is a raster
  of an already-projected drawing. What is forbidden is a third independent path
  from millimetres to a coordinate space, because each one is a place the maths
  can silently disagree with the others.

- Imperial parsing must accept what planners actually type: `12'6"`, `12' 6 1/2"`,
  `150in`, `12.5ft`.

## Reverse if

A genuine requirement for sub-millimetre precision appears — CNC output, or
laser-measured venue survey import where the source data is finer than a
millimetre. Neither is in scope, and neither is plausible for banquet furniture.
