# Roadmap

Eleven phases, 0 through 10. Each is independently verifiable and each names the
check that proves it done. Ordering is deliberate: the load-bearing and
hardest-to-change layers come first, and geometry — the thing most likely to be
subtly wrong for months — is proven before anything is drawn.

MVP ships whole. There is no partial public release.

| Phase                        | Delivers                                                                                                                        | Done when                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **0** Foundation             | Repo, Vite + Svelte + TS strict, lint, tests, CI, bundle budget, licence, docs                                                  | `npm run verify` green on a clean clone                                                       |
| **1** Geometry core          | Integer-mm maths, unit parse/format, transforms, polygons, snapping, clearance, **and the to-scale PDF projection**             | High-coverage unit suite; real-world fixtures round-trip exactly; **the ruler test passes**   |
| **2** Document + undo        | Element model, immutable updates, command stack, `.floored` + JSON Schema, OPFS autosave, crash recovery, migrations            | Fuzzed undo/redo reaches a stable state; save/load round-trips identically                    |
| **3** Renderer               | Dual canvas, viewport, rbush index, culling, hit-testing, dirty regions                                                         | Benchmark holds 60 fps pan/zoom at target object count; CI fails on regression                |
| **4** Editing tools          | Select, marquee, move, rotate, duplicate, array, align, distribute, group, room drawing, layers                                 | Playwright interaction suite passes on all three engines                                      |
| **5** Catalog + capacity     | Object library with verified dimensions, custom objects, measure tool, seat roll-up, clearance warnings, occupant-load estimate | Capacity maths matches the reference table in [RESEARCH.md](RESEARCH.md#3-domain-constants)   |
| **6** Export                 | Text and font embedding, page tiling, title block, print styling, PNG, SVG                                                      | Whole-plan export measures true; visual regression on emitted output                          |
| **7** Guest list + seating   | CSV import with reconciliation, groups, drag- and click-to-seat, separations, auto-assign, table numbering, day-of sheets       | Assignment passes hand-built cases; messy CSV fixtures import; day-of sheets carry every name |
| **8** PWA + onboarding       | Workbox, install flow, update prompt, templates, empty state, share links                                                       | Works with the network disabled; Lighthouse PWA pass                                          |
| **9** Accessibility + polish | Keyboard operation, WCAG 2.2 AA on chrome and panels, canvas fallback, browser matrix, tablet touch                             | axe passes in CI; manual keyboard walkthrough; four-browser matrix green                      |
| **10** Launch                | Docs site, CONTRIBUTING, templates, governance, Pages deploy, domain                                                            | A stranger clones and runs it in under 10 minutes                                             |

XLSX import is not in phase 7. Every spreadsheet exports CSV, and the parsers
that read `.xlsx` are a zip reader and an XML parser away from the zero-runtime
-dependency rule — it is a post-1.0 candidate, not a gap.

## Explicitly out of scope

Accounts, telemetry, cloud storage, payments, IoT, AR/VR. DWG import is
impossible under permissive licensing ([ADR-0010](adr/ADR-0010-dependency-policy.md))
and will not be reconsidered.

## Post-1.0 candidates

Each requires justification from evidence before any code is written:

3D preview · real-time collaboration (Yjs) · DXF import/export · AI layout
suggestion · Tauri desktop wrapper · venue template library

## Definition of done for 1.0

On a clean machine, with no account and no network after first load, a user can:

open the app → pick a wedding template → adjust the room to a real venue's
dimensions → place 40 tables and 320 chairs → import a guest CSV → assign every
guest respecting constraints → see a clearance warning on a too-narrow aisle →
export a to-scale PDF → print it → **measure a known dimension on the paper with
a ruler and have it be right.**
