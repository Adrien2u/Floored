# ADR-0002 — Svelte 5, Vite, TypeScript strict

**Status:** Accepted · 2026-08-08

## Context

The canvas is imperative and owns its own render loop
([ADR-0001](ADR-0001-rendering.md)). The UI framework therefore drives only
panels, dialogs, menus, and the guest list — not the drawing surface. Its main
cost is the runtime weight it charges against the 400 KB budget that the app's
own code needs.

## Decision

Svelte 5 with Vite and TypeScript in strict mode, including
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

Svelte's runtime is the smallest of the credible options, and compile-time
reactivity means less framework code shipped per component. Vite gives fast HMR,
a first-class PWA plugin path for Phase 8, and a build that stays boring.

Strict TypeScript is not negotiable in a codebase whose core is geometry: an
`undefined` slipping into a coordinate is a misprinted floor plan.

## Rejected alternatives

| Option         | Why not                                                                                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React**      | The strongest counter-argument, on contributor pool alone. Rejected because the hard parts of this codebase are framework-agnostic, and panel UI in any of these is an afternoon's learning. The runtime cost is charged every page load; the contributor cost is paid once per contributor. |
| **Vue**        | Comparable ergonomics, larger runtime than Svelte, no decisive advantage here.                                                                                                                                                                                                               |
| **Vanilla TS** | Tempting given how little framework the app needs, but the guest list and property panels are genuinely stateful and reactive. Hand-rolling that is the wrong kind of lazy.                                                                                                                  |
| **SvelteKit**  | Brings a server story to an app whose central claim is that it has no server.                                                                                                                                                                                                                |

## Consequences

- Domain logic lives in `src/lib/`, never in components. Components read and
  render; they do not compute. This keeps the framework swappable and the logic
  testable without a DOM.
- Contributors unfamiliar with Svelte need onboarding notes in CONTRIBUTING.

## Reverse if

Contributor recruitment demonstrably stalls on Svelte specifically — not
hypothetically, but with evidence in issues or declined PRs. Because domain
logic is framework-free, a migration would touch `src/ui/` only.
