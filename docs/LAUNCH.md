# Launch posts

Drafts, not published. Each one is written for the place it goes — the same
paragraph pasted into four sites reads as a press release everywhere and lands
nowhere.

Two things must be filled in before any of these go out: the repository URL and
the live app URL. Neither exists yet — no git remote is configured, and no
custom domain has been chosen. Every `<REPO_URL>` and `<APP_URL>` below is a
placeholder.

---

## Hacker News (Show HN)

**Title:** `Show HN: Floored – free, offline floor planner for events, no account`

**Body:**

> I kept running into the same wall in event floor planners: design all day for
> free, then pay at the moment you want to save the file or print it. The
> closest free competitor paywalls exactly those two things.
>
> A floor plan is a small document edited on a canvas. It needs no server. Once
> the server is gone the recurring costs are gone, and the paywalled feature set
> can just be the free feature set. That's the whole idea.
>
> Floored is a static web app. It runs offline, stores plans as plain JSON you
> own, and exports a to-scale PDF you can measure with a ruler — there's a CI
> test that parses the emitted PDF and checks a reference line's coordinates, so
> that claim is a fact rather than marketing.
>
> It also does the part people actually dread: import a guest CSV, drag guests
> onto tables, handle groups and "these two must not sit together", and print
> the four day-of sheets (find-my-seat, per-table server sheets, place cards,
> check-in list).
>
> Some things I didn't expect going in:
>
> - Zero runtime dependencies. The PDF writer, PNG encoder, CSV parser and
>   service worker are all in the repo. 48 KB gzipped.
> - Sharing works without a server: the plan is compressed into the URL
>   fragment, which browsers never send anywhere.
> - The capacity numbers are the credibility. Every dimension in the catalog
>   carries a source, and it estimates NFPA 101 occupant load — labelled as an
>   estimate, because that's what it is.
>
> MIT, no accounts, no telemetry, no paywall, and a permanent guarantee that
> every future version opens every file any earlier version wrote.
>
> <APP_URL> · <REPO_URL>

Expect, and answer honestly: "why not DWG?" (no permissive reader exists, it is
out of scope permanently), "isn't this just Excalidraw?" (no — to-scale output
and seating are the whole product), and "what happens when you get bored?" (see
GOVERNANCE.md — it forks with nothing needed from me).

---

## r/eventplanning

Shorter, no architecture. That subreddit cares whether it saves an afternoon.

> I built a free floor planner because I got tired of hitting a paywall on
> _save_ and _export_.
>
> Import your guest CSV, drag people onto tables, and print the find-my-seat
> list, the per-table sheets for servers, the place cards and the check-in list.
> The PDF is to scale, so the venue can measure it. It warns you when an aisle
> is under 36″ or tables are closer than 54″.
>
> No account, no trial, no upgrade prompt. It runs in your browser and works
> with the wifi off. Free permanently — there's no server to pay for.
>
> If a table size or arrangement you use is missing, tell me and I'll add it —
> that's the part where you know more than the code does.
>
> <APP_URL>

Do not cross-post this verbatim to r/weddingplanning; rewrite it around one
wedding (head table, dancefloor, the grandparents-apart constraint) or it reads
as a spam broadcast.

---

## Lobsters

Tag `web`. Lobsters wants the engineering, briefly.

> A local-first floor planner for events. Svelte 5 and Canvas2D, integer
> millimetres as the only internal unit, and exactly two projections out of it —
> screen pixels and PDF points. That constraint is what makes the printed plan
> measurable rather than approximately right.
>
> Zero runtime dependencies: the PDF writer, PNG encoder, CSV parser and service
> worker are all first-party. 48 KB gz.
>
> The write-up I'd read first is docs/adr/ — including ADR-0001, where hand-rolling
> the renderer was chosen over Konva/Pixi, and why the reasoning would have been
> wrong for a general drawing app.
>
> <REPO_URL>

---

## Notes for whoever posts these

- Post the Show HN on a weekday morning US-Eastern and then stay at the keyboard
  for a few hours. An unanswered thread dies.
- Never claim code compliance. The occupant-load figure is an estimate against
  NFPA 101 factors and must be described that way every single time.
- Link the repository, not a landing page. The audience for all three of these
  would rather read the source.
