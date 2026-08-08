# ADR-0001 — Hand-rolled Canvas2D renderer with rbush, dual-canvas

**Status:** Accepted · 2026-08-08

## Context

The editor must sustain 60 fps pan and zoom, stay inside a 400 KB gzipped
bundle, use permissive dependencies only, and feed a **vector** PDF exporter that
prints to measurable scale ([ADR-0007](ADR-0007-to-scale-pdf.md)).

Measured throughput, 8,000 boxes on a 2019 MacBook Pro:

| Library        | Chrome | Firefox   |
| -------------- | ------ | --------- |
| PixiJS (WebGL) | 60 fps | 48 fps    |
| Konva          | 23 fps | **7 fps** |
| Fabric.js      | 9 fps  | 4 fps     |

## Decision

Own the renderer: immediate-mode Canvas2D, dual-canvas, `rbush` R-tree for
hit-testing and viewport culling.

- **Static canvas** draws elements. **Interaction canvas** draws selection
  handles, snap guides, and drag previews. Moving the pointer never repaints the
  world. (Pattern taken from Excalidraw.)
- `rbush` answers "what is under this point" and "what is in this viewport"
  without scanning every element.
- Dirty-region redraw on the static canvas.

The decisive argument is not the benchmark. It is that to-scale vector PDF
export forces geometry into a framework-independent millimetre document model
regardless. Once that model exists, a scene-graph library is just rendering our
data from its own duplicate copy — most of its value is already gone, and we
would be paying bundle size and a second source of truth for the remainder.

## Rejected alternatives

| Option        | Why not                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fabric.js** | 9 fps at 8k objects fails the budget outright.                                                                                                                                                                                                                                                                |
| **Konva**     | 23 fps Chrome is survivable; **7 fps Firefox is not**, and Firefox is a supported target.                                                                                                                                                                                                                     |
| **PixiJS**    | Hits 60 fps, but WebGL is a rasterization pipe — the parallel document model is still required, so we would carry a WebGL renderer _and_ our own scene graph. Also the largest bundle, with sprite/texture machinery irrelevant to vector shapes, and it complicates crisp text and hairlines at print scale. |
| **tldraw**    | **Licence-disqualified.** Production use requires a trial, commercial, or hobby licence; the hobby licence mandates a non-removable "made with tldraw" watermark and forbids interfering with licence-key validation. Downstream users of an MIT project embedding it would each need their own licence.      |
| **SVG DOM**   | Simple and accessible, but thousands of DOM nodes destroy pan/zoom performance.                                                                                                                                                                                                                               |

## Independent review

A second opinion (MiMo v2.5-pro, via Delegation Router) reached the same
conclusion unprompted and on the same reasoning, estimating ~150 KB gzipped
total including pdf-lib. It flagged a risk this ADR had underweighted — see
Consequences. Its suggestion to copy interaction patterns from tldraw's source
"as MIT" is factually wrong and was rejected; Rough.js is genuinely MIT and is a
fair reference. Codex failed on a CLI error; Gemini returned HTTP 403.

## Consequences

**Risk 1 — geometry correctness.** Hand-rolled hit-testing and transform maths is
the kind of code that is subtly wrong for months. Mitigation: the geometry layer
is pure functions with heavy unit tests, built and proven in Phase 1 _before_ any
rendering code exists.

**Risk 2 — interaction surface.** Konva and Fabric provide drag, resize handles,
rotation gizmos, multi-select, and constrained snapping for free. Rolling these is
roughly two weeks of careful pointer-event work; rotation-with-snap-to-angle and
multi-selection nudge/align are where bugs hide and polish dies. Mitigation:
Phase 4 is its own phase with a Playwright interaction suite written alongside,
not afterwards.

**Bounded scope.** Floor plans need a small closed set of primitives — rectangle,
circle, polygon, polyline, text, image. This is not a general drawing surface,
which is what makes owning the renderer tractable.

**Escape hatch.** If the renderer stalls, PixiJS replaces _only_ the renderer.
The document model is independent by design, so no other layer changes.

## Reverse if

Open Question 1 shows realistic scenes exceed ~5,000 objects, or the Phase 3
benchmark cannot hold 60 fps at the target count. At that point WebGL becomes
necessary rather than optional.
