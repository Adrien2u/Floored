# ADR-0007 — To-scale PDF via pdf-lib vector output

**Status:** Accepted · 2026-08-08

## Context

"Prints to scale" is the promise a professional planner tests within thirty
seconds of opening the app, with a ruler. Getting it wrong costs credibility that
no feature recovers.

Competitor research found this is also where paywalls sit: the closest free
competitor blocks PDF export entirely on its free tier.

## Decision

Export by walking the millimetre document model and emitting **vector**
primitives through `pdf-lib`.

- PDF user space is 1/72 inch. The conversion is exact:
  `points = mm × 72 / 25.4`. No approximation, no magic numbers.
- The drawing scale (`1/4" = 1'-0"`, `1:50`, …) is applied **once**, at the
  projection. Never partially, never twice.
- Plans exceeding the sheet tile across pages with overlap and match-lines.
- Every sheet carries a title block: event name, date, **scale**, sheet number,
  object counts.

**Never rasterize the screen canvas into the PDF.** A screenshot in a PDF wrapper
is resolution-dependent, unmeasurable, and unprintable at professional quality.
This is the single most important line in this ADR.

## Verification — the ruler test

A CI test that gates the export phase:

1. Build a document containing a reference line of exactly 1000 mm.
2. Export at a known scale.
3. Parse the emitted PDF and read back the line's coordinates.
4. Assert the length in points equals `1000 × 72 / 25.4 × scale` within a tight
   tolerance.

This converts "measures correctly with a ruler" from a marketing claim into a
build failure when it stops being true.

## Rejected alternatives

| Option                       | Why not                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| jsPDF                        | Higher-level API, and mm/cm precision complaints are documented against it. The projection maths must be ours. |
| Canvas → PNG → PDF           | Resolution-dependent, unmeasurable, unprofessional. Defeats the entire requirement.                            |
| Browser print-to-PDF via CSS | No control over scale fidelity, page tiling, or title blocks. Output varies by browser.                        |
| Server-side rendering        | There is no server, by design.                                                                                 |

## Consequences

- The export pipeline reads only the document model, never renderer state. The
  renderer could be replaced without touching export — which is precisely the
  property [ADR-0001](ADR-0001-rendering.md) depends on.
- Text and hairlines need explicit width handling so they stay legible at print
  scale rather than vanishing.
- SVG export shares the same projection code path; PNG is the only rasterized
  output and is documented as screen-quality, not measurable.

## Reverse if

The ruler test proves impossible to satisfy with pdf-lib at required tolerance —
in which case the fallback is emitting PDF operators directly, not switching to a
rasterized pipeline. The vector requirement is not negotiable.
