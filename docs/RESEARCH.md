# Research

Evidence behind the product decisions. Claims carry sources. Anything
unverified is labelled as such rather than smoothed over.

Last updated: 2026-08-08.

---

## 1. Competitive landscape

| Tool                                                                                                               | Model                               | Free tier reality                                                                             |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------- |
| [SeatPlan.io](https://seatplan.io/)                                                                                | £0 / £8 once / £14 once / £20–25 mo | Free tier **cannot save and cannot export PDF**. DXF import is top-tier only.                 |
| [Prismm](https://www.capterra.com/p/173852/Prismm/reviews/) (ex-AllSeated)                                         | Paid SaaS                           | No meaningful free tier. Reviewers cite upfront cost as a barrier for smaller firms.          |
| [Cvent Event Diagramming](https://www.trustradius.com/products/cvent-social-tables/reviews/all) (ex-Social Tables) | Enterprise                          | No free tier.                                                                                 |
| [PerfectTablePlan](https://www.capterra.com/p/74189/PerfectTablePlan/reviews/)                                     | One-time purchase, desktop          | Desktop-only, no cloud sync, no mobile, paid major-version upgrades.                          |
| [Sweet Home 3D](https://www.sweethome3d.com/)                                                                      | Free, open source                   | Genuinely free — but interior/home design. No banquet objects, no seating, no capacity maths. |
| [openPlan3D](https://github.com/laanlabs/open3dFloorplan)                                                          | MIT, open source                    | Genuinely free and local-only. Home floor plans, not events.                                  |
| [eventfloorplanner.com](https://eventfloorplanner.com/)                                                            | Claims "free forever"               | **UNVERIFIED** — SPA, unreadable over plain HTTP. Open question.                              |

### The gap

No tool gives away **save + to-scale PDF export + seating assignment**. That is
precisely where the closest free competitor draws its paywall — and it is free to
provide in a local-first architecture, because none of it costs the provider
anything once there is no server.

---

## 2. User pain points

From Capterra, TrustRadius, and G2 review bodies. Ranked by frequency × severity.
Reddit and YouTube comment mining is still outstanding.

**1. Seating assignment is clumsy.** _"Assigning guests to seats can be an
absolute pain if you don't know what you're doing."_ Users explicitly ask for
drag-and-drop from the guest list. Building rows is fiddly, especially at angles,
and users complain about constantly switching tools to select versus alter seats.

**2. Sharing and client review is broken.** Some tools require exporting a PDF and
emailing it for feedback. Where sharing exists, clients _"do not understand the
functions or make changes without informing the creator."_

**3. Overkill for small events.** _"A lot of setup involved if you are only laying
out a handful of booths."_ Users report copy-paste in another program being
faster for simple diagrams.

**4. Learning curve for non-technical staff.** _"Some less-computer-savvy team
members have a hard time understanding the intricacies."_

**5. Flat plans are hard to read.** _"It's hard to tell what shapes are in the
flat layouts."_ This is about the legibility of the output, not the editor.

### What this changes in the product

| Pain | Response                                                                                              |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 1    | Drag-from-list seating as a first-class interaction, not a mode                                       |
| 2    | Read-only share links ([ADR-0009](adr/ADR-0009-sharing.md)) — client can view, cannot silently mutate |
| 3    | Templates and an empty state that produce a usable plan in under 60 seconds                           |
| 4    | No hidden modal state; visible keyboard reference; forgiving defaults                                 |
| 5    | Print legibility treated as a feature — labelled objects, optional numbering                          |

---

## 3. Domain constants

These become the object-library defaults. Getting them wrong makes the tool
useless to professionals; getting them right is the cheapest credibility
available.

### Tables and seating

| Item                   | Value                                       |
| ---------------------- | ------------------------------------------- |
| 60″ round              | 8 guests comfortably (6 spacious, 10 tight) |
| 72″ round              | 10–12 guests                                |
| Banquet space planning | 10–12 sq ft per person                      |

### Clearances

| Clearance                                                  | Value                                 |
| ---------------------------------------------------------- | ------------------------------------- |
| Main aisle, ADA minimum                                    | **36″** (2010 ADA Standards §403.5.1) |
| Main aisle, service and egress practice                    | **60″**                               |
| Between round tables, minimum                              | **54″**                               |
| Between round tables, comfortable                          | **60″**                               |
| Between round tables, with arm-chairs or tall centrepieces | **72″**                               |
| ADA knee clearance under table                             | **27″**                               |

### Occupant load (NFPA 101)

| Use                                | Factor                      |
| ---------------------------------- | --------------------------- |
| Unconcentrated (tables and chairs) | **15 net sq ft per person** |
| Concentrated (no fixed seating)    | **7 net sq ft per person**  |

Net area excludes corridors, stairs, restrooms, mechanical rooms, and fixed
equipment.

**Product opportunity.** A live "NFPA-estimated occupant load vs. your seated
count" readout is something planners currently compute by hand, and no free tool
offers it. It must be presented as an **estimate**, never as a compliance
certification — the authority having jurisdiction decides, not a web app.

Sources: [ADA aisle and clearance guidance](https://www.superiorseating.com/design-specs-center) ·
[banquet table capacities](https://www.webstaurantstore.com/blog/115/how-many-people-can-different-size-banquet-tables-seat-comfortably.html) ·
[NFPA 101 occupant load factors](https://sfm.illinois.gov/content/dam/soi/en/web/sfm/sfmdocuments/documents/calculating-occupant-loads-for-assembly-occupancies-march-2022.pdf)

---

## 4. Technical prior art

### Canvas engine benchmark

8,000 boxes, MacBook Pro 2019 ([source](https://github.com/slaylines/canvas-engines-comparison)):

| Library   | Chrome | Firefox |
| --------- | ------ | ------- |
| PixiJS    | 60 fps | 48 fps  |
| Konva     | 23 fps | 7 fps   |
| Fabric.js | 9 fps  | 4 fps   |

Decision and reasoning: [ADR-0001](adr/ADR-0001-rendering.md).

### Licensing findings

- **tldraw — disqualified.** Production use requires a trial, commercial, or
  hobby licence; the hobby tier mandates a non-removable "made with tldraw"
  watermark and forbids interfering with licence-key validation. Downstream users
  of an MIT project embedding it would each need their own licence.
  ([licence](https://tldraw.dev/legal/tldraw-sdk-3-x-license))
- **DWG** — no permissive reader exists. Out of scope permanently.
- **DXF (JavaScript)** — `dxf-parser` (v1.1.2) and `dxf-writer` (v1.18.4) are both
  ~4 years stale. [`dxf`](https://github.com/skymakerolof/dxf) (v5.3.1, ~9 months)
  and `@tarikjabiri/dxf` (Feb 2026) are the maintained options.

### Architecture reference — Excalidraw

Worth learning from, not forking ([source](https://deepwiki.com/excalidraw/excalidraw/5-rendering-and-export)):

- **Dual-canvas split** — static canvas for elements, separate interactive canvas
  for selection handles and overlays. Pointer movement never repaints the world.
- **Viewport culling** before render.
- **Immutable element updates** feeding a history store, which explicitly
  _excludes_ ephemeral state from the undo stack.

That last point is the one most often got wrong. Deciding up front what is _not_
undoable is what keeps undo from feeling haunted — see
[ADR-0003](adr/ADR-0003-document-and-undo.md).

---

## 5. Open questions

| #   | Question                        | How it gets resolved                                                                                                                                                       |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Realistic max scene size        | Count objects in competitor sample plans and real venue diagrams. Sets the Phase 3 benchmark; could reopen [ADR-0001](adr/ADR-0001-rendering.md) toward WebGL.             |
| 2   | Is DXF import actually needed   | Find what venues really hand over — DXF, PDF, or a photo. If mostly PDF and images, scale-calibrated image import covers it and DXF stays post-1.0.                        |
| 3   | eventfloorplanner.com free tier | Load in a real browser and establish whether "free forever" includes save and export. If it does, the gap argument in §1 needs revisiting.                                 |
| 4   | Reddit and YouTube pain points  | Generic web search does not reach these. Mine r/eventplanning, r/weddingplanning, r/CateringIndustry, and competitor tutorial comments. Expected to refine the §2 ranking. |
