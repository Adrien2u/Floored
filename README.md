# Floored

Free, open-source, local-first floor planning and seating design for events.

No account. No server. No subscription. Works offline. Prints to scale.

## Why this exists

Every event floor planner either charges for the moment the tool becomes useful,
or solves a different problem. The closest free competitor lets you design all
day and then blocks **saving** and **PDF export** behind a paywall.

A floor plan is a small document edited on a canvas. It needs no server. Remove
the server and the recurring costs vanish — which means the paywalled feature set
can be the free feature set, permanently. That is the entire thesis.

## What it does

**Draw the room.** Real dimensions, in feet-and-inches or metric, held internally
as integer millimetres so nothing drifts. Rooms, tables, staging, bar,
dancefloor, columns, seating blocks.

**Get the numbers right.** Every dimension in the catalog carries a source. The
app warns when aisles fall below the 36″ ADA minimum or tables sit closer than
54″, and estimates occupant load against NFPA 101 factors — labelled as an
estimate, because that is what it is.

**Seat the guests.** Import a CSV, then drag guests onto tables or click to
place them. Groups, separations, auto-assign, an assignment lock, and five table
numbering patterns. Re-import an updated list and people keep their seats.

**Print what the day runs on.** A to-scale PDF you can measure with a ruler,
multi-page tiling with match lines, plus the four day-of sheets: find-my-seat,
per-table server sheets, folded place cards, and a check-in list. PNG and SVG
too.

**Keep your work.** Plans are plain JSON you own, with a published schema and a
permanent promise: every future version opens every file any earlier version
wrote. Enforced by tests, not by good intentions.

**Share without uploading.** A share link carries the whole plan in the URL
fragment, which browsers never send to a server. The recipient opens a copy.

**Work anywhere.** Installs as a desktop or tablet app, runs with the network
switched off, and pinches to zoom under a fingertip.

## What it will never do

Accounts, telemetry, cloud lock-in, payments, or a paywall. DWG import is
impossible under permissive licensing and is out of scope permanently.

## Quick start

```bash
npm install
npm run dev
```

That is the whole setup — no database, no services, no API keys. There is no
backend to configure because there is no backend.

Full verification, exactly as CI runs it:

```bash
npm run verify   # format, lint, types, 716 unit tests, build, bundle budget
npx playwright test   # 235 end-to-end tests across Chromium, Firefox, WebKit
```

## Status

Phases 0–9 of 10 are done: geometry, document model, renderer, editing tools,
catalog and capacity, export, seating, PWA and templates, accessibility. Phase 10
is launch — docs, deployment, and the parts that make it findable.

The bundle is 48 KB gzipped against a 400 KB budget, with **zero runtime
dependencies**. Everything the app does at runtime, it does with the platform and
its own code — including the PDF writer, the PNG encoder, the CSV parser, and the
service worker.

## Documentation

| Document                                       | What's in it                                                  |
| ---------------------------------------------- | ------------------------------------------------------------- |
| [docs/STRUCTURE.md](docs/STRUCTURE.md)         | Where code lives and why                                      |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)   | How the system fits together                                  |
| [docs/RESEARCH.md](docs/RESEARCH.md)           | Competitors, user pain points, domain constants, with sources |
| [docs/ACCESSIBILITY.md](docs/ACCESSIBILITY.md) | What works by keyboard and screen reader — and what does not  |
| [docs/schema/](docs/schema/)                   | The `.floored` file format, published as a contract           |
| [docs/ROADMAP.md](docs/ROADMAP.md)             | The ten phases and what each delivers                         |
| [docs/adr/](docs/adr/)                         | Architecture decisions and the reasoning behind them          |
| [CONTRIBUTING.md](CONTRIBUTING.md)             | Setup, conventions, how to land a change                      |
| [GOVERNANCE.md](GOVERNANCE.md)                 | Who decides what, and what is not up for discussion           |

## Licence

[MIT](LICENSE). Every dependency is MIT, Apache-2.0, BSD, or ISC — verified by
reading the licence, not assumed from a badge. See
[ADR-0010](docs/adr/ADR-0010-dependency-policy.md).
