# Floored — Project Review (Phase 0 Complete)

## 1. Project Context (as understood from codebase)

### Core thesis

A floor plan is a small document edited by one person. Remove the server and the
paywalled feature set of existing tools becomes free forever — permanently, not
as a trial.

### Target end users

- Event/wedding planners (solo operators and small firms priced out of
  SeatPlan.io / Prismm / Cvent).
- Venue coordinators needing quick to-scale layouts.
- Non-technical staff: the onboarding target is "stranger clones and runs in
  under 10 minutes" (Phase 10).

### Planned core features (1.0 definition of done)

1. Draw a room → place tables, chairs, staging, bar, dance floor.
2. Snap, align, measure, warn on sub-ADA/service aisle clearance.
3. Import guest CSV → drag guests to seats with group/conflict rules.
4. Estimate occupant load vs NFPA 101 factors.
5. Export **to-scale PDF** (measurable with a ruler), PNG, SVG.
6. Runs fully offline via PWA; no account, no server, no telemetry.
7. Documents stored as human-diffable `.floored` JSON with a backward-compat
   guarantee enforced in CI.

### Constraints decided (non-negotiable)

- Integer millimetres internally; `Mm` suffix on every length variable.
- `src/lib/geometry/` imports nothing, touches no DOM — shared by renderer & exporter.
- Two projection functions only: `mmToScreen`, `mmToPdfPoints` (a third = bug).
- Dual canvas: static (dirty-region repaint) + interaction (free repaint).
- Command-stack undo with forward+inverse; viewport/selection/panels explicitly NOT undoable.
- One JSON file (`.floored`) with `schemaVersion`; one migration fn per bump.
- OPFS primary store, download/upload portable path.
- Permissive licences only (MIT/Apache-2.0/BSD/ISC), verified by reading source.
- Bundle budgets: JS < 400 KB gzipped, CSS < 50 KB gzipped.
- Files under ~300 lines; colocated unit tests; `index.ts` re-exports only.
- Never: accounts, telemetry, cloud, payments, paywall, DWG import.

### Progress to date

- **Phase 0 complete.** `npm run verify` is green. Repo + Vite + Svelte 5 +
  TS strict + ESLint + Prettier + Vitest + Playwright config + CI workflow +
  bundle-size gate + MIT licence + docs. Current bundle: 11.4 KB JS (2.8% of
  budget).
- **Phase 1 started.** `src/lib/geometry/units.ts` with `inches`, `feet`,
  `toInches`, `formatLength`, `parseLength` — 22 unit tests, all passing.
- `src/ui/App.svelte` is a Phase 0 placeholder that wires the geometry core
  into the app shell (displays a 60" round table in both unit systems).
- No `.floored` schema drafted yet. No `document/`, `render/`, `tools/`,
  `catalog/`, `export/`, `seating/`, or `persistence/` directories exist —
  they appear when their phase begins (by design, per STRUCTURE.md).

---

## 2. Gaps in the Current Plan

### G1 — The to-scale PDF promise is de-risked too late

The ruler test (Phase 6) is the single credibility-defining feature — it is
what makes the headline claim _true_. But it sits behind Phases 3, 4, and 5.

The architecture explicitly states export reads the document model directly,
not renderer state. This means the PDF export path is independent of the canvas
renderer. **It can and should be proven in Phase 1**, using the geometry layer
alone. Write the ruler test against a hardcoded 1000 mm reference line and the
`mmToPdfPoints` projection now. If the projection math or pdf-lib pipeline
proves tricky, you learn that in Phase 1 — not after 5 phases of canvas work.

**Action:** Move the ruler test (or a Phase 1 variant of it) into Phase 1 as a
non-negotiable checkpoint. The projection function `mmToPdfPoints` and a
minimal PDF emission test should land before any rendering code.

### G2 — No draft JSON Schema exists yet

Phase 2 will define the document schema, but there is no draft to work from.
Without a concrete schema, Phase 2 is entirely greenfield discovery. Worse,
the backward-compat guarantee ("every future version opens every file ever
written") needs a fixture corpus with one sample file per released version —
but there are zero released versions yet.

**Action:** Draft the Phase 1/2 element schema and JSON Schema draft as part of
Phase 1 completion. Decide now whether `schemaVersion` is numeric (1, 2, 3) or
semver — the ADR says "one migration function per version bump" and the README
says "minor version" / "major version," which is inconsistent terminology.

### G3 — The seating constraint solver has no algorithm decision

Phase 7 requires drag-to-seat assignment with group rules, conflict avoidance,
and auto-assign respecting table capacity. This is NP-hard in the general case
(seating with conflict graphs is equivalent to graph colouring). The plan
describes the inputs/outputs but not the algorithm.

**Action:** Add an ADR precursor to Phase 7: decide greedy vs. backtracking vs.
constraint-propagation. Document the simplification (e.g., groups must sit
together, conflicts must be separated — a backtracking solver is likely
sufficient for <500 guests). Without this, Phase 7 can balloon.

### G4 — PWA is deferred to Phase 8 despite being a core premise

"Works offline" and "installs as desktop app" are in the README's opening line
and the headline promise. But PWA setup (Workbox, manifest, install flow) is
Phase 8 — after every real feature is built. If the offline story breaks late,
you cannot ship.

**Action:** Move a _skeleton_ PWA setup (manifest, basic Workbox precache of the
shell) into Phase 0 or Phase 1. Not the full update-prompt UX — just the
service-worker registration so caching behaviour is tested throughout, not
bolted on at the end.

### G5 — XLSX import dependency is unanalysed

Phase 7 needs CSV and XLSX import. SheetJS (`xlsx`) is ~600 KB minified —
unaffordable against the 400 KB JS budget even code-split (the transitive graph
is large). No alternative (e.g., `exceljs` for parsing only, or restricting to
CSV + a documented "convert XLSX to CSV" instruction) is evaluated.

**Action:** Run a dependency analysis before Phase 7. Decide between:
(a) `xlsx` lazy-loaded only on import (bundle spike acceptable, lazy path is
offline-only), (b) CSV-only import with a "convert in Excel/LibreOffice first"
workflow, (c) a lighter XLSX parser.

### G6 — Bundle size gate has no per-dependency guardrail

The CI size check only measures total output. A 200 KB dependency could slip in
and pass as long as the total stays under 400 KB. ADR-0010's ladder helps but is
not enforced in tooling.

**Action:** Add a per-dependency size alert to CI — e.g., warn if any single
dependency's gzipped contribution exceeds 25 KB in the final bundle.

### G7 — No shared state / phase tracking for the collaborating agent

There is no `PROJECT_STATUS.md` or phase tracker. Both agents will be guessing
which phase is active and what's complete.

**Action:** Create a `PROJECT_STATUS.md` at repo root with the current phase,
who owns what, and handoff criteria. Update it at every phase boundary.

### G8 — `.claude/settings.local.json` permissions are minimal

The CI workflow uses `npm ci` + `npm run verify` + `npx playwright test`, but the
local permissions only cover `npm run *` and `npx vitest/prettier`. An agent
attempting full verification locally will hit permission blocks on
`npm run build` and `npx playwright test`.

**Action:** Extend the permissions allow-list to cover `npm run build`,
`npm run check`, and `npx playwright test` so local verification matches CI.

---

## 3. Potential Roadblocks

### R1 — Firefox performance on hand-rolled Canvas2D

ADR-0001 benchmarks Konva at 7 fps on Firefox (the disqualifying factor). But
those benchmarks compare libraries — not a hand-rolled renderer. The dual-canvas
approach is sound, but Firefox's Canvas2D implementation has historically been
slower than Chrome's on path-filling and compositing. The Phase 3 benchmark
("60 fps at target object count on all three browsers") is at risk.

_Mitigate:_ Run the Phase 3 benchmark on Firefox _and_ WebKit, not just Chrome.
Pin the target object count once Open Question 1 (RESEARCH.md §5) is resolved.

### R2 — OPFS is Chromium-only; Firefox/Safari get no autosave/crash recovery

ADR-0005 chose OPFS for autosave. OPFS is unavailable in Firefox and Safari.
The download/upload fallback works for explicit save/load, but the "loud prompt
to save real files" and "crash recovery offers the autosaved document on next
load" promises are Chromium-only. On Firefox/Safari, a tab crash loses the entire
in-progress plan with no recovery.

_Mitigate:_ Implement an IndexedDB fallback for autosave (explicitly allowed by
ADR-0005's "reverse if" clause) so crash recovery works everywhere. Document
the degraded UX on non-Chromium browsers.

### R3 — The "only two projection functions" rule conflicts with SVG export

ADR-0001 and ADR-0006 state `mmToScreen` and `mmToPdfPoints` are the only two
projections ("a third is a bug"). But Phase 6 also exports SVG and PNG. SVG can
share `mmToPdfPoints` (SVG user units are arbitrarily mappable). PNG requires a
raster path. The rule needs a precision qualifier: _two coordinate projections_;
raster export is a downstream conversion, not a third source-of-truth projection.

_Mitigate:_ Clarify the rule in ADR-0006 to distinguish "coordinate projection"
(violations are bugs) from "output format conversion" (necessary, but must chain
off one of the two projections).

### R4 — Malicious `.floored` file parsing

SECURITY.md lists this as a threat. No design exists for safe parsing — how
does the app prevent a crafted file from exhausting memory during deserialization
(e.g., a 10 MB single-element JSON bomb, or deeply nested references)?

_Mitigate:_ Add a Phase 1.5 (between geometry and document) or Phase 2 task:
a bounded JSON parser with depth/size limits and a documented attack surface
review before the format is accepted from untrusted input.

### R5 — Open Question 1 (max scene size) is on the critical path for ADR-0001

ADR-0001's reversal condition ("realistic scenes exceed ~5,000 objects") gates
the entire renderer decision. But the research to estimate this is deferred to
Phase 8 (PWA) as an "open question." If the estimate comes in at 8,000 objects,
the entire hand-rolled Canvas2D renderer may need to pivot to WebGL mid-
development.

_Mitigate:_ Resolve Open Question 1 during Phase 0/1 — survey competitor sample
plans and real venue diagrams now. This is a research task, not a coding task,
and it de-risks the single biggest technical bet.

### R6 — SVG sanitization on import

SECURITY.md notes SVG can carry scripts. No library is chosen. DOMPurify is MIT
but adds ~20 KB minified even tree-shaken. If SVG import is a Phase 6 feature,
the bundle budget absorbs it, but the choice must be made before code starts.

_Mitigate:_ Decide before Phase 6: (a) DOMPurify, (b) an allowlist-based XML
parser, (c) no SVG import (only PNG/raster image import). Document the choice
in an ADR.

---

## 4. Alignment Check — Planned Work vs. Project Goals

| Goal                            | Phase | Alignment           | Notes                                                                        |
| ------------------------------- | ----- | ------------------- | ---------------------------------------------------------------------------- |
| To-scale PDF (ruler test)       | 6     | ⚠ Partial           | Correctly independent of renderer, but too late to de-risk. See G1.          |
| Offline PWA                     | 8     | ⚠ Misaligned        | Premise is in the headline, but setup is Phase 8. See G4.                    |
| No server/accounts              | All   | ✅ Strong           | Every decision (OPFS, URL fragment sharing, local document) reinforces this. |
| Guest assignment w/ constraints | 7     | ✅ Correct scope    | Constraint solving deferred but acknowledged as hard. See G3.                |
| Human-diffable JSON             | 2     | ✅ Correct approach | Plain objects, `JSON.stringify`, migrations.                                 |
| 60 fps pan/zoom                 | 3     | ⚠ Needs validation  | Benchmark cited but not re-verified for hand-rolled code. See R1.            |
| < 400 KB bundle                 | All   | ✅ Hard-gated       | CI fails on regression; bundle is 2.8% of budget at Phase 0.                 |

**Overall alignment: strong.** The dependency-directed acyclic graph
(geometry → document → render → tools → catalog → export → seating → PWA → a11y)
correctly front-loads the hardest-to-change layers. The "document is source of
truth" architecture directly supports the three core deliverables (PDF export,
undo, serialization) with no conflict.

The one consistent weak point: the to-scale PDF promise and the offline promise
are both front-loaded in marketing but deferred in implementation. These are the
two things that make the tool _Floored_ rather than a generic planner — both
deserve earlier de-risking.

---

## 5. Concrete Improvements

1. **Prove the ruler test in Phase 1.** Write `mmToPdfPoints` and a minimal PDF
   emission test against a hardcoded 1000 mm line. This is the single most
   important correctness assertion in the entire project — it should fail the
   build if it ever breaks, and it should exist as early as possible.

2. **Draft the `.floored` JSON Schema now.** Even a partial schema (element with
   id, type, geometry in mm) gives Phase 2 a concrete target and makes the
   backward-compat guarantee testable against fixtures. Resolve the
   numeric-vs-semver versioning question.

3. **Resolve max scene size (Open Question 1) before Phase 3.** Survey
   competitor sample layouts and real venue diagrams. This is the input that
   gates the entire renderer decision (ADR-0001 reverse condition).

4. **Move a PWA skeleton into Phase 0/1.** Register a service worker with
   Workbox precaching the shell. The full update-prompt UX can wait, but the
   caching behaviour should be tested throughout development.

5. **Add a per-dependency size guardrail to CI.** Warn (not fail) when any
   single dependency contributes >25 KB gzipped. Prevents slow budget erosion
   even when the total is still under 400 KB.

6. **Design the seating constraint solver before Phase 7.** A backtracking
   solver with group-stay-together and conflict-separation constraints is likely
   sufficient. Document it in an ADR so the team doesn't discover the
   complexity mid-implementation.

7. **Implement IndexedDB autosave fallback.** So Firefox/Safari users get
   crash recovery, not just Chromium users. The ADR already allows this as a
   fallback; make it a Phase 2 task.

8. **Create `PROJECT_STATUS.md`.** A single source of truth for which phase is
   active, who owns what, and what "done" looks like. Both agents update it at
   every phase boundary.

9. **Extend local agent permissions.** Add `npm run build`, `npm run check`, and
   `npx playwright test` to `.claude/settings.local.json` so local
   verification mirrors CI without permission prompts.

10. **Clarify the "two projections" rule.** Update ADR-0006 to distinguish
    coordinate projections (exactly two, violations are bugs) from output-format
    conversions (raster, SVG — necessary, must chain off a projection).

---

## 6. Coordination Suggestions for the Collaborating Agent

### Phase ownership model

Split along architectural seams to minimize cross-agent coupling:

- **Agent A (math/pipeline):** Phase 1 (geometry) → Phase 2 (document/undo) →
  Phase 6 (export). These are well-bounded, pure-function-heavy, and the
  foundation everyone else builds on.
- **Agent B (interaction):** Phase 3 (renderer) → Phase 4 (tools) → Phase 5
  (catalog) → Phase 7 (seating). These are open-ended, pointer-event-heavy, and
  higher-risk.

Handoff between A and B at Phase 2→3 boundary: the document model and undo
stack are the shared contract. Agent A proves it works; Agent B builds the
renderer and tools against it.

### Communication mechanisms

- **`PROJECT_STATUS.md`** at repo root. Updated at every phase boundary. Both
  agents read it before starting work to confirm scope alignment.
- **Phase gate:** no phase starts until the previous one passes
  `npm run verify` green — including the bundle-size check, the ruler test
  (post-Phase 1), and (where applicable) e2e tests.
- **Decisions → ADRs before code.** If a phase requires a non-obvious decision
  (constraint solver, XLSX library, SVG sanitization), write the ADR first. The
  other agent can review it out-of-band.
- **Conflict resolution:** BDFL per CONTRIBUTING.md. If agents disagree on an
  ADR, one writes the case and the other defers to the BDFL decision.

### Tooling alignment

- Both agents run `npm run verify` locally before pushing. The CI workflow
  already enforces this, but local verification catches issues faster.
- Use the same path aliases (`$lib/*`, `$ui/*`) and naming conventions already
  established. Deviating causes svelte-check and ESLint failures.
- Do not create directories in advance of their phase (STRUCTURE.md rule). An
  empty `src/lib/render/` directory implies "renderer exists and works" —
  avoid this signal noise.

### Risk hand-off

- Agent A delivers: geometry correctness (proven), document schema + JSON Schema
  (drafting), undo stack (working), OPFS + IndexedDB autosave (crisis-tested).
- Agent B receives those as immutable contracts and must not need to modify the
  geometry layer (that would reopen Phase 1). If Agent B discovers a geometry
  gap, file it as a Phase 1 bug — do not patch around it in the renderer.
