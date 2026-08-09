# Accessibility

This is a statement of what works, what does not, and why — not a compliance
badge. Where the app falls short, it says so here rather than leaving someone to
discover it mid-event.

## What is enforced by tests

| Promise                                                  | Enforced by                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Every function is reachable by keyboard                  | `tests/e2e/accessibility.spec.ts`, run on all three engines |
| Text meets WCAG 2.2 AA contrast in both themes           | `src/ui/contrast.test.ts`, which reads the real palette     |
| Every drag has a single-pointer alternative (WCAG 2.5.7) | `tests/e2e/seating.spec.ts` — click-to-place, not only drag |
| Landmarks and controls have names                        | `tests/e2e/accessibility.spec.ts`                           |
| Motion respects `prefers-reduced-motion`                 | Every component's stylesheet                                |

## Keyboard

The plan is a tab stop of its own, reachable directly by the skip link that is
the first thing focus lands on.

| Key              | Does                                                   |
| ---------------- | ------------------------------------------------------ |
| `Tab`            | Move between controls; the skip link jumps to the plan |
| `]` / `[`        | Step forwards or backwards through the elements        |
| Arrow keys       | Nudge the selection by one grid step                   |
| `Shift` + arrows | Nudge by ten                                           |
| `Alt` (held)     | Suspend snapping                                       |
| `Delete`         | Remove the selection                                   |
| `Escape`         | Deselect                                               |
| `Ctrl/Cmd` + `Z` | Undo — `Shift` too, to redo                            |
| `Ctrl/Cmd` + `A` | Select everything visible                              |
| `Ctrl/Cmd` + `D` | Duplicate                                              |

Shortcuts are ignored while typing in a field. This was a bug once: pressing
Backspace to fix a search term deleted the selected tables, because the handler
is bound to the window and the text field never got to say the key was already
spoken for.

## Screen readers

**The drawing itself is a canvas, and a canvas says nothing.** There is no
honest way around that with the current renderer; a plan is a spatial artefact,
and no amount of markup makes "the bar is to the left of the dancefloor" audible
in a useful way.

What exists instead:

- The plan has an accessible name that lists the keys it accepts.
- A live summary, updated as the plan changes, states how many elements and
  seats it holds and what is selected — so every keyboard command has an
  audible result.
- Everything that is not geometry lives in real markup: the guest list, the
  capacity readout, the clearance warnings, and the numbering are all ordinary
  focusable, labelled controls.
- The day-of exports are the plan as text. A screen-reader user who needs the
  seating rather than the layout can read the find-my-seat list.

**Known limits.** Reading the layout, judging spacing by eye, and dragging an
element to a particular spot are visual operations that this app does not make
non-visually equivalent. Stepping through elements and nudging them is the
substitute, and it is a real one for editing, not for reading a room.

## Colour

Colour is never the only signal. Clearance problems carry text; selection
carries handles as well as a colour; the seating panel names conflicts rather
than merely tinting them.

The accent is blue and the warning amber — deliberately, since both appear on a
plan at once and blue against amber survives the common colour-vision
deficiencies where red against green does not.

## Touch and tablet

Pointer events throughout, so a stylus or finger drives the same code as a
mouse. Two fingers pinch to zoom and pan together — without it a tablet had no
way to zoom at all, since there is no wheel and no keyboard in a venue, and a
plan that cannot be zoomed cannot be checked. A pinch that starts on a table
abandons the drag rather than committing it: the user was reaching to zoom, not
choosing to move something two millimetres.

WCAG 2.2 asks for 24 × 24 CSS pixels at AA (2.5.8). Every control measured 27px
until this was checked — passing on paper, and miserable with a fingertip on a
tablet in a venue, which is where this app is most likely to be used standing
up. The floor is 32px now, applied globally rather than per component so a new
control cannot quietly opt out. Checkboxes stay 16px and their labels carry the
target, which is what a person aims at anyway.

One deliberate exception: rows in the guest list are 32px rather than larger, so
200 names stay scannable. Every one of those rows has a bigger equivalent in the
table detail beside it.

## What has not been done

- No automated axe run in CI. `axe-core` is MPL-2.0, which is outside the
  licence set this project holds itself to; the checks above are hand-written
  instead. If the licence policy is ever revisited, adding axe as a
  dev-dependency is the first thing to do.
- No manual screen-reader pass has been recorded here yet. When one happens, it
  goes in this file with the reader, the version, and what it found.
