# Floored

Free, open-source, local-first floor planning and seating design for events.

No account. No server. No subscription. Works offline. Prints to scale.

> **Status: pre-alpha.** Phase 0 of 10. Not yet usable for a real event.
> See [docs/ROADMAP.md](docs/ROADMAP.md) for what ships when.

## Why this exists

Every event floor planner either charges for the moment the tool becomes useful,
or solves a different problem. The closest free competitor lets you design all
day and then blocks **saving** and **PDF export** behind a paywall.

A floor plan is a small document edited on a canvas. It needs no server. Remove
the server and the recurring costs vanish — which means the paywalled feature set
can be the free feature set, permanently. That is the entire thesis.

## What it will do

- Draw a room to real dimensions and lay out tables, chairs, staging, bar,
  dancefloor
- Snap, align, measure, and warn when aisles fall below ADA and service minimums
- Import a guest list and drag guests onto seats, with group and conflict rules
- Estimate occupant load against NFPA 101 factors
- Export a **to-scale PDF you can measure with a ruler**, plus PNG and SVG
- Run entirely offline, installed as a desktop app via PWA
- Store documents as plain, documented, human-diffable JSON you own

## What it will never do

Accounts, telemetry, cloud lock-in, payments, or a paywall. DWG import is
impossible under permissive licensing and is out of scope permanently.

## Quick start

```bash
npm install
npm run dev
```

Full verification, exactly as CI runs it:

```bash
npm run verify
```

## Documentation

| Document                                     | What's in it                                                  |
| -------------------------------------------- | ------------------------------------------------------------- |
| [docs/STRUCTURE.md](docs/STRUCTURE.md)       | Where code lives and why                                      |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the system fits together                                  |
| [docs/RESEARCH.md](docs/RESEARCH.md)         | Competitors, user pain points, domain constants, with sources |
| [docs/ROADMAP.md](docs/ROADMAP.md)           | The 10 phases and what each delivers                          |
| [docs/adr/](docs/adr/)                       | Architecture decisions and the reasoning behind them          |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Setup, conventions, how to land a change                      |

## Licence

[MIT](LICENSE). Every dependency is MIT, Apache-2.0, BSD, or ISC — verified, not
assumed. See [docs/adr/ADR-0010-dependency-policy.md](docs/adr/ADR-0010-dependency-policy.md).
