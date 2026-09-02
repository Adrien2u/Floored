# Signage assets and single-page export — work report

**Date:** 2 September 2026
**Branch:** `feat/signage-and-single-page-export`
**Status:** working; cleanup pass still to come

## Why

Backpack Blast 2026 (Houston Food Bank, Greater Houston Sports Club, 19 October 2026) needs its pavilion signage on the floor plan. The source document is
`BPB26_Signage_Plan.docx.pdf`; §2 (Pavilion Signage Plan) names three numbered
signs and a set of pavilion features. Floored could represent none of it:

- The catalog held 15 hardcoded items in three categories — table, seating,
  fixture. Nothing for signage.
- `FixtureKind` was `stage | dancefloor | bar | buffet | av | column | other`.
  A gift station, a photo booth and a TV all had to be `other` plus a label.
- No image support anywhere, and the hand-written PDF writer embeds no images.

Second problem: the Pavilion plan (35.3 m × 15.0 m) always exported as two
sheets. The export menu offered "Fit to page", which never fit anything to a
page — it picked the largest _standard_ architectural scale and tiled when none
fit. That mislabelled option is what read as "strict page settings".

Third: three fixtures in the working file carried the wrong asset name.

## What changed

### 1. Schema version 4

`src/lib/document/element.ts`

- New `SignElement` type. It shares `origin` / `widthMm` / `depthMm` with
  `FixtureElement` on purpose, so bounds, hit-testing, dragging and rotation
  reuse the fixture paths instead of growing a parallel set. Those three are the
  **plan footprint** — what the sign occupies on the floor. `faceHeightMm` is
  the printed face's vertical height, which never shows in plan view but is what
  gets ordered from the printer.
- New `SignMount` union: `aFrame | tableTent | banner | cartBoard | wall`.
- `FixtureKind` extended with `registration`, `giftStation`, `photoBooth`,
  `display`, `kiosk`, `lounge`.
- `DEFAULT_LAYERS` gains `signage`, between `furniture` and `annotations`. Signs
  are the one class of object read on its own — the install crew works a sign
  plan, the catering crew works a furniture plan.

`src/lib/document/serialize.ts`

- Canonical key order and a validating read branch for `sign`.
- An unrecognised `mount` **rejects the element** rather than defaulting.
  Fixture kinds fall back to `other` because a mislabelled buffet is still a
  buffet-shaped box; silently redrawing someone's A-frame as a wall panel is a
  quieter failure and a worse one.
- `MIGRATIONS[3]` is an explicit no-op, matching 1→2 and 2→3. The change is
  additive, so nothing in an existing file needs rewriting.
- The migration deliberately **does not** append `signage` to an old file's
  layer list. Rewriting a user's layers on open is a change to their document
  they did not ask for. New documents get the layer from `DEFAULT_LAYERS`.

`docs/schema/floored-v4.schema.json` published; `docs/schema/README.md` and
`docs/adr/ADR-0004-file-format.md` updated. The ADR note records why signs carry
a sponsor as _text_ rather than artwork: real artwork is the case that forces the
zip-container question, and it is still open.

### 2. Catalog — 16 new items

`src/lib/catalog/catalog.ts`. New `signage` category, one `sign(...)` builder
driving every signage entry, and a `MOUNT_FOOTPRINT_DEPTH_MM` table so each
mount's floor footprint is stated once.

Pavilion signs (§2.1):

| Catalog id            | Name                                                     | Sponsor               |
| --------------------- | -------------------------------------------------------- | --------------------- |
| `sign-raffle-auction` | Raffle & Auction Sign — A-Frame 24x36                    | Tasquantum (Briley)   |
| `sign-dinner-line`    | Dinner / Food & Refreshment Line Sign — Table Tent 22x28 | Deutser (Pit Room)    |
| `sign-wine-bar`       | Wine / Bar Sign — Table Tent 22x28                       | Steel Supply (Caymus) |

On-course signage (§3):

| Catalog id             | Name                                    | Sponsor   |
| ---------------------- | --------------------------------------- | --------- |
| `sign-course-banner`   | Course Banner — Sponsor                 | —         |
| `sign-comfort-station` | Comfort Station A-Frame — HFB Inventory | Mobilease |

Golf cart signage (§4) — the recommendation plus both fallbacks:

| Catalog id             | Name                                   |
| ---------------------- | -------------------------------------- |
| `sign-cart-board`      | Golf Cart Board — Coroplast 10x36      |
| `sign-cart-cling-half` | Golf Cart Windshield Cling — Half 8x18 |
| `sign-cart-cling-full` | Golf Cart Windshield Cling — Full 8x36 |
| `sign-cart-magnet`     | Golf Cart Magnetic Panel               |

Pavilion features from §2 (fixtures, not signs):

| Catalog id                | Name                             | Kind           |
| ------------------------- | -------------------------------- | -------------- |
| `feature-registration`    | Event Registration Desk          | `registration` |
| `feature-gift-station`    | Gift Station                     | `giftStation`  |
| `feature-photo-booth`     | Instant-Print Photo Booth        | `photoBooth`   |
| `feature-tv`              | Mounted Television               | `display`      |
| `feature-raffle-print`    | Raffle Ticket Printing Table 8ft | `kiosk`        |
| `feature-auction-display` | Auction & Raffle Display Table   | `display`      |
| `feature-lounge-nook`     | Lounge Nook                      | `lounge`       |

Sizes marked TBD in the source (course banner, comfort station A-frame, cart
magnet) are drawn at a stated working size and say so in the item note, rather
than being left out.

### 3. Rendering

Signs draw through the existing rectangle paths in `render/draw.ts`,
`render/scene.ts`, `export/plan-svg.ts` and `export/plan-pdf.ts` — no new
primitives, which keeps inside the "not a general drawing surface" boundary of
ADR-0001.

Two deliberate differences:

- On screen, signs fill with the accent colour rather than the panel grey. At
  plan zoom a 2ft object drawn as an outline disappears, and it is exactly what
  someone opens a sign plan to find.
- In the PDF, a sign's caption is set **beside** it, not inside it. A sign's
  footprint is a couple of feet across, far too small to hold text at plan
  scale; keying a small object and setting its text alongside is standard
  architectural practice.

### 4. Single-page export

`src/lib/export/projection.ts`

- `drawableArea(page, reservedHeightPt)` — new, so the title-block strip is
  subtracted in one place instead of by each caller.
- **Bug fixed:** `fitsOnPage` subtracted the margins but not the 54pt title
  block, so it disagreed with the box `exportPlanPdf` actually tiles against. A
  plan it called a fit could still come out as two rows. It now takes the
  reserved height, and `largestFittingScale` passes it through.
- `fitScale(...)` — new. Free-form ratio that exactly fills the drawable area.
  This is the one sanctioned exception to the rule that scales must be readable
  on a physical rule.
- `isStandardScale(scale)` — new.

`src/lib/export/plan-pdf.ts`

- `ExportOptions.singlePage`. Forces `columns = rows = 1` rather than
  recomputing from the ratio: `fitScale` sizes content to sit exactly on the
  drawable edge, and a ratio that is mathematically 1 can land a hair above it
  in floating point, which `ceil` turns into a second blank sheet.
- An explicit `scale` still wins over `singlePage` — an explicit scale is a
  stronger instruction than a page-count preference.
- `ExportResult.notToScale`, and the title block SCALE field prints
  `1:139 — NOT TO SCALE` when the ratio is non-standard. The stamp is on the
  sheet, not only in the dialog: a PDF gets emailed onward and the warning has
  to travel with it.

`src/lib/export/plan-svg.ts` takes the same option, so exporting the same view
as SVG and as PDF gives the same drawing.

`src/ui/FileMenu.svelte` — `auto` relabelled **"Largest standard scale"** (it
never was "fit to page"), and a new **"Fit to one page (not to scale)"** choice.

#### How scaling behaves

Measured on the real Pavilion file:

| Choice                           | Result                                         |
| -------------------------------- | ---------------------------------------------- |
| Largest standard scale (default) | **2 sheets** at 1/8" = 1'-0"                   |
| Fit to one page                  | **1 sheet** at **1:139**, stamped NOT TO SCALE |

1:139 is not a ratio any scale rule reads, which is the whole trade: the sheet
becomes a walkthrough / overview / email attachment and stops being a build
sheet. Anyone who needs to measure exports at a standard scale and gets tiles.

When a fitted ratio happens to land on a standard scale — a 20ft-wide plan fills
the 720pt drawable at exactly 1/2" = 1'-0" — nothing is lost and the sheet is
**not** stamped. A warning that is not true would be worse than none.

### 5. The working file

`Pavilion---Houston-Food-Bank,-GHSC-102025 (2).floored` in Downloads (backup
alongside it as `.floored.bak`). Bumped to schema 4; three fixtures renamed:

| id           | Position                 | Was              | Now                          |
| ------------ | ------------------------ | ---------------- | ---------------------------- |
| `5c0ca3f9-…` | (305, 314) top-left      | `av` / "AV / DJ" | `photoBooth` / "PHOTO BOOTH" |
| `b21e3f11-…` | (32597, 314) top-right   | `av` / "AV / DJ" | `bar` / "BAR"                |
| `ec153784-…` | (304, 13446) bottom-left | `av` / "AV / DJ" | `bar` / "BAR"                |

Verified through the app's own parser: 0 `av`, 1 `photoBooth`, 3 `bar`.

## Verification

- `npx vitest run` — **739 passing, 35 files**.
- `npx tsc --noEmit`, `npx svelte-check` (388 files), `npx eslint`,
  `npx prettier --check` — all clean.

New test files:

- `src/lib/document/sign.test.ts` (9 tests) — round-trips every mount and every
  new fixture kind, byte-stable re-save, rejects an unknown mount and a
  zero-footprint sign, migrates a v3 file without touching its layer list, and
  checks bounds/anchor/move behaviour.
- `src/lib/export/single-page.test.ts` (14 tests) — the drawable-area fix, the
  fitted scale sitting flush on the drawable edge, one sheet out of the Pavilion
  plan, the NOT TO SCALE stamp present when earned and absent when not, and an
  explicit scale beating `singlePage`.

Three existing tests changed expectation, all for the new `signage` layer:
`document.test.ts` (four default layers), `serialize.test.ts` (layer fallback),
`catalog.test.ts` (signage items land on the signage layer).

## Open items

1. **Three bars, not two.** The renames give the two bars §2 calls for, but the
   original `bar-sw` "BAR" is still in the file. Nothing was deleted — that is
   a decision, not a cleanup.
2. **Nothing new is placed.** The gift station, TVs, raffle printing table,
   auction display, lounge nooks and the three pavilion signs exist in the
   catalog but are not in the plan. Placement is being done by hand, from the
   2025 vendor layout.
3. **No logo artwork.** Sponsor is text. Real logos need an image element type,
   scale calibration, a zip container (ADR-0004) and PDF XObject embedding
   (ADR-0011) — a separate project.
4. **Page size is still hardcoded** to Letter landscape; `ExportOptions.page`
   exists but no caller passes it. Fit-to-one-page on ARCH D would be a
   different and better answer for a plan this size.
5. **Tiles still have no overlap or match-lines**, despite ADR-0007 promising
   them. Untouched here; pre-existing.
