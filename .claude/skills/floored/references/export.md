# Export

Sources: `src/lib/export/{projection,plan-pdf,plan-svg,day-of,download}.ts`.

## Headless vs browser

**`src/lib/export/download.ts` is browser-only.** `savePdf`, `saveSvg`, `savePng`,
`saveDocument`, `saveDayOfPack` and `downloadBlob` all touch the DOM and will
throw under Vitest. They are the browser's file-save sinks, nothing more.

Headless scripts call the `export*` / `*Pdf` functions and write the result with
`node:fs`.

**PDF output is a `string`, not a byte array.** Write it as `latin1`:

```ts
writeFileSync('plan.pdf', exportPlanPdf(doc).pdf, 'latin1');
```

Writing it as `utf8` re-encodes bytes above 0x7F and produces a corrupt file.
SVG is normal text and takes `utf8`.

PNG export exists only in the browser path — it rasterises the live canvas. There
is no headless PNG.

## To-scale PDF

```ts
const result = exportPlanPdf(doc, {
  page, // PageSpec, default PAGE.letterLandscape
  scale, // DrawingScale, default: largest standard scale that fits
  system, // 'imperial' | 'metric', default doc.meta.unitSystem
  showSeats, // draw every generated seat; turn off for very large plans
  sheetTitle, // printed in the title block
});
// { pdf: string, scale, scaleLabel, pages, tiled }
```

Verified against the `wedding` template:

```
default            → 1/8" = 1'-0"   1 page,  not tiled, 25901 bytes
SCALE.imperial1_4  → 1/4" = 1'-0"   4 pages, tiled
```

### Scales and pages

```ts
SCALE = {
  imperial1_8: 1 / 96, // 1/8" = 1'-0"  — fits a large ballroom on one sheet
  imperial1_4: 1 / 48, // the common detail scale
  imperial1_2: 1 / 24,
  metric1_100: 1 / 100,
  metric1_50: 1 / 50,
  full: 1, // tests only
};

PAGE = { letter, letterLandscape, a4, a4Landscape }; // all with a 36 pt margin
```

Omit `scale` and the exporter picks the largest standard scale that fits one page,
falling back to tiling at the smallest standard scale.

**It will not invent an intermediate scale.** No physical scale rule reads 1:83,
so a sheet drawn at it cannot be measured — which defeats the entire point of the
export. Forcing a larger scale than fits produces multiple sheets with match
lines, never a shrunk-to-fit drawing. Check `result.tiled` and `result.pages` if
a single sheet matters to you.

`scaleLabel` is what a title block would print: `1/8" = 1'-0"`, `1:100`.

## SVG

```ts
const svg = exportPlanSvg(doc, { scale, showSeats, marginMm }); // default margin 500 mm
writeFileSync('plan.svg', svg, 'utf8');
```

The root element carries physical `width` and `height` in millimetres, so printing
at 100% gives a measurable sheet — the same guarantee the PDF makes, by the same
arithmetic. Single sheet only; no tiling.

## Day-of pack

```ts
const pdf = dayOfPackPdf(doc, seatingPlan, { eventName: 'Smith Wedding' });
writeFileSync('day-of.pdf', pdf, 'latin1');
```

One PDF containing four sheet types in the order a planner assembles the folder:

| Sheet        | Purpose                                                     |
| ------------ | ----------------------------------------------------------- |
| Find my seat | Guests A–Z with their table. Pinned at the entrance.        |
| Table sheets | One page per table, listing who sits there and their meals. |
| Place cards  | Cut-out cards, one per guest.                               |
| Check-in     | Arrival list for the door.                                  |

The individual builders are exported too if you want one sheet on its own:
`findMySeatPdf`, `tableSheetsPdf`, `placeCardsPdf`, `checkInPdf`, plus `*Pages`
variants returning `PdfPage[]` for composing your own pack with `buildPdf`.

`eventName` prints in every header, so a stack of loose paper stays identifiable.

## The projection rule

There are **exactly two projection functions in the codebase**:

- `mmToScreen` — `src/lib/render/viewport.ts`, for the canvas
- `mmToPdfPoints` — `src/lib/export/projection.ts`, for the page

`mmToPdfPoints` is what the ruler test pins. If it is wrong, every printed plan is
wrong and the product's central claim is false. Never add a third projection; if
you need page coordinates, compose these.

`pdfPointsToMm` is the inverse, for reading a measurement back off a page.

## The PDF writer

`src/lib/export/minimal-pdf.ts` is hand-written (ADR-0011) — `pdf-lib` was
evaluated at 19.5 MB unpacked and unmaintained, to wrap operators Floored can emit
directly. Text uses Helvetica with real AFM glyph widths and WinAnsi encoding
(`pdf-font.ts`), so `textWidth()` measures rather than guesses.

Test-only readers `extractLines`, `extractText` and `countPages` let a test assert
on the geometry inside a generated PDF. Use them if you are verifying export
output rather than eyeballing it.
