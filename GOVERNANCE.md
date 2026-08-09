# Governance

Stated plainly, because an unstated governance model is still a governance
model — usually a worse one, discovered only when somebody disagrees.

## Today: one maintainer

The project is run by its original author, who has the final say on scope,
architecture, and what ships. That is a benevolent-dictator model, and it is the
honest description of a project this age rather than an aspiration to something
grander.

What that means in practice:

- Pull requests need one approving review from the maintainer to merge.
- Disagreements are settled by discussion first and by the maintainer's decision
  when discussion does not converge.
- The maintainer can be wrong, and being told so in an issue is a contribution.

## The path to more maintainers

This is written now, while nothing is at stake, so that it is not negotiated
later under pressure.

A contributor is invited to become a maintainer when they have:

- landed several non-trivial changes that needed no rework,
- shown judgement in review — catching real problems, and letting small ones go,
- and stayed around long enough that the invitation is not a surprise.

There is no fixed number of commits, because the number is not what matters.

At three or more active maintainers, this document changes: decisions move to
rough consensus, with the tie broken by the maintainer who owns the area. That
change is itself a pull request, discussed in the open.

## What is not up for discussion

Some things are load-bearing for what this project _is_, and changing them means
building a different project rather than changing this one:

- **It stays free, with no paywall.** Not free-tier. Free.
- **No accounts, no telemetry, no server as a requirement.** The plan lives on
  the user's machine.
- **The file format guarantee holds.** Every future version opens every file any
  earlier version wrote. Permanently, and enforced by tests.
- **Dependencies stay permissively licensed**, verified by reading the licence
  rather than trusting a badge ([ADR-0010](docs/adr/ADR-0010-dependency-policy.md)).

A proposal to change one of these will be read and answered, but the answer is
almost certainly no.

## Decisions and their records

Anything that shapes the architecture gets an [ADR](docs/adr/): the decision, the
alternatives, and the reasoning — including the parts that later turned out to be
wrong. Released ADRs are amended with what was learned rather than rewritten, for
the same reason released migrations are never edited: they are the record of what
was believed at the time.

## Releases

There is no calendar. A release happens when a phase in
[docs/ROADMAP.md](docs/ROADMAP.md) is green and the whole matrix passes.

## If this project is abandoned

It is MIT-licensed, has no server, no accounts, and no runtime dependencies. A
fork needs nothing from the original maintainer but the code, which is already
in everyone's hands. That is not a contingency plan; it is the reason the
architecture is shaped this way.
