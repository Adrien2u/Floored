# ADR-0011 — Write PDFs ourselves rather than depending on pdf-lib

**Status:** Accepted · 2026-08-08 · _provisional, revisited in Phase 6_

## Context

[ADR-0007](ADR-0007-to-scale-pdf.md) commits to vector PDF export and names
`pdf-lib` as the likely tool. Actually checking it against the
[ADR-0010](ADR-0010-dependency-policy.md) ladder changed the answer.

| Check                                             | Result                                  |
| ------------------------------------------------- | --------------------------------------- |
| Licence                                           | MIT — passes                            |
| Last published                                    | **2022-05-12**, nearly four years stale |
| Unpacked size                                     | **19.5 MB**                             |
| Rung 5 — "can it be a few lines of our own code?" | For vector paths, yes                   |

The deciding argument is not size or staleness. It is that ADR-0007 already
requires the projection maths to be ours, and a floor plan's drawing vocabulary
is tiny: straight lines, rectangles, circles, and text in one font. A PDF content
stream is a short list of postfix operators. There is very little library left to
use once the coordinate maths is excluded.

## Decision

Emit PDFs directly. `src/lib/export/minimal-pdf.ts` builds a single-page
document with a hand-assembled object table and xref.

Implemented in Phase 1, ahead of its phase, so the ruler test could run before
any rendering code existed — see Consequences.

Current scope: lines, rectangles, circles (four cubic beziers per circle),
correct `/Length` and byte-accurate xref offsets. No fonts, no images, no
compression, no incremental update.

## Rejected alternatives

| Option                   | Why not                                                                                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pdf-lib**              | 19.5 MB unpacked and unmaintained since 2022, to wrap operators we can emit directly. Still the fallback if text and font embedding prove harder than expected. |
| **jsPDF**                | Documented mm/cm precision complaints, and the projection must be ours regardless.                                                                              |
| **Browser print-to-PDF** | No control over scale fidelity, tiling, or title blocks; output varies by browser.                                                                              |

## Consequences

**The ruler test ran in Phase 1 instead of Phase 6.** This is the real payoff.
The credibility-defining claim is now verified before the renderer, the tools, or
the catalog exist. It caught two genuine defects immediately:

1. `largestFittingScale` iterated a hand-ordered candidate list that was not
   sorted by magnitude — `1/50` sat before `1/48`, and `1/100` before `1/96` — so
   it returned a smaller scale than necessary.
2. The same function mixed imperial and metric scales in one list. A plan drawn
   at `1/8" = 1'-0"` cannot be measured with a metric scale rule, so returning it
   to a metric user breaks the promise exactly as badly as bad arithmetic. Scale
   selection is now restricted to one measuring system.

Neither would have surfaced until Phase 6 under the original plan.

**Font embedding is the open risk.** Text needs either a standard-14 font
reference (simple, limited) or TrueType embedding with a width table (real work).
Phase 6 decides; if embedding proves expensive, `pdf-lib` returns as a
lazy-loaded import used only on export, which keeps it out of the initial bundle.

**We own PDF correctness.** A malformed file that opens in one reader and not
another is now our bug. Mitigated by testing structure explicitly — xref offsets
are asserted against real byte positions — and by keeping the emitted subset
small enough to reason about.

## Reverse if

Font embedding or image placement in Phase 6 costs more than a few hundred lines,
or a real-world reader rejects our output. The fallback is a lazy-loaded
`pdf-lib` on the export path only — the projection code is unaffected either way,
because it never depended on the writer.
