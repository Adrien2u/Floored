# ADR-0010 — Permissive licences only, verified at the source

**Status:** Accepted · 2026-08-08

## Context

Floored is MIT and must stay redistributable by anyone, including commercially,
without conditions. "Open source" is not a synonym for "permissive", and several
prominent editor libraries are neither.

## Decision

**Allowed:** MIT, Apache-2.0, BSD-2/3-Clause, ISC.

**Not allowed:** GPL, AGPL, LGPL, and source-available licences that present as
open — BUSL, Elastic, FSL, and watermark- or key-gated SDK licences.

**Licences are verified by reading the `LICENSE` file in the dependency's own
repository at the version being added.** Not from a blog post, not from an npm
badge, not from memory. A concrete case: tldraw is widely described as open
source, and its SDK licence requires a trial, commercial, or hobby licence for
production use, mandates a non-removable watermark under the hobby tier, and
forbids interfering with licence-key validation. It is disqualified — and it is
disqualified only because someone read the licence.

## Adding a dependency

Climb the ladder and stop at the first rung that holds:

1. Does this need to exist at all?
2. Does the codebase already have it?
3. Does the standard library or a web platform API cover it?
4. Does an already-installed dependency cover it?
5. Can it be a few lines of our own code?
6. Only then: add a dependency.

A new dependency must state, in the PR: licence (verified), gzipped size, last
commit date, open-issue health, and which rung of the ladder it cleared.

## Consequences

- Some capabilities stay unavailable. **DWG import has no permissive reader and
  is out of scope permanently** — documented in the README so it is not
  relitigated in the issue tracker.
- Bundle size stays defensible because every addition is argued rather than
  assumed.
- The 400 KB gzipped budget is enforced in CI, so a licence-clean but bloated
  dependency still fails the build.

## Reverse if

Never for the licence rule — it is a project value, not an optimisation. The
ladder may be relaxed for development-only dependencies, which ship nothing to
users.
