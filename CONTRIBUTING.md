# Contributing to Floored

Thanks for considering it. This should take about ten minutes to get running.

## Setup

```bash
git clone https://github.com/<owner>/floored.git
cd floored
npm install
npm run dev
```

That's the whole setup. No database, no services, no API keys — the app has no
backend and never will.

Before opening a PR, run exactly what CI runs:

```bash
npm run verify        # format, lint, types, unit tests, build, bundle budget
npx playwright test   # the browser matrix — installs its own browsers first
```

The first `playwright test` run downloads three browser engines, which is the
one part of setup that is not instant. Everything else is `npm install`.

## Where things live

Read [docs/STRUCTURE.md](docs/STRUCTURE.md) first — it explains the layout and the
one rule that matters: **dependencies point downward, and `src/lib/geometry/`
imports nothing.**

If you're changing behaviour rather than fixing a bug, read the relevant
[ADR](docs/adr/) first. If your change contradicts one, that's fine — but say so
in the PR, because it means the ADR needs updating or superseding.

## Good first issues

Issues labelled `good first issue` are real work, not busywork. The most valuable
ones need domain knowledge more than editor internals:

- **Object catalog** — adding furniture with correct real-world dimensions
- **Templates** — more arrangements, or better numbers in the seven that exist
- **Unit parsing** — the ways planners actually type dimensions
- **Documentation** — if something confused you, that's a bug in the docs

If you plan events for a living and have never written TypeScript, the catalog
and template issues are genuinely where you'd help most.

## Conventions

**Commits** follow conventional commits:

```
feat: add 72-inch round table to catalog
fix: correct aisle clearance check at rotated tables
docs: clarify the ruler test in ADR-0007
```

Types: `feat` `fix` `refactor` `docs` `test` `chore` `perf` `ci`

**Code:**

- TypeScript strict. No `any`, no non-null assertions outside tests.
- Millimetre values carry the `Mm` suffix — `widthMm`, not `width`. This makes a
  unit error visible at the call site instead of on a misprinted floor plan.
- Files under ~300 lines. Past that, split along the seam.
- Domain logic in `src/lib/`, never in components.
- Unit tests colocated: `units.ts` → `units.test.ts` beside it.

**Accessibility:** every drag needs a click-or-key equivalent (WCAG 2.5.7), and
new colours have to pass `src/ui/contrast.test.ts`, which reads the real
palette. See [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md).

**Tests:** anything with a branch, a loop, or a calculation needs one. Geometry
and capacity maths need thorough ones — that's where bugs are silent and
expensive. Trivial one-liners don't.

## Adding a dependency

Read [ADR-0010](docs/adr/ADR-0010-dependency-policy.md) before you do.

Short version: MIT / Apache-2.0 / BSD / ISC only, verified by reading the
dependency's own `LICENSE` file — not a badge, not a blog post. Your PR must
state the licence, gzipped size, last commit date, and why the standard library
or an existing dependency doesn't cover it.

The bundle budget is enforced in CI, so a licence-clean but heavy dependency
still fails the build.

## Pull requests

1. Branch from the default branch.
2. Keep the diff scoped to one thing.
3. `npm run verify` green.
4. Describe what changed and why. Link the issue.
5. If it changes user-visible behaviour, say how you tested it by hand.

Refactoring unrelated code in the same PR makes review harder. If you spot
something worth fixing, open an issue — it'll get fixed properly.

## Reporting bugs

Include: what you did, what happened, what you expected, browser and version.
Attach the `.floored` file if the bug involves a specific plan — the format is
plain JSON, so you can read exactly what you're sharing before you share it.

## Security

Do not open a public issue for a security problem. See
[SECURITY.md](SECURITY.md).

## Governance

One maintainer decides, and says so plainly rather than implying a consensus
that does not exist. [GOVERNANCE.md](GOVERNANCE.md) sets out how that changes,
and the short list of things that are settled rather than open.

## Code of conduct

Be decent. Assume good faith. Disagree about the work, not the person. Behaviour
that makes people not want to contribute is the one thing that gets you removed.
