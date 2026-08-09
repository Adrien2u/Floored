# ADR-0013 — The seating model

**Status:** Accepted · 2026-08-08

## Context

Research ranked clumsy seat assignment as the **single biggest complaint** about
existing tools ([RESEARCH.md §2](../RESEARCH.md)). It is also the largest phase
in the plan, and the one where a wrong data model is most expensive to correct
later.

Four decisions here come from a working event-management system the project
owner runs for a 500-guest fundraiser — a Google Apps Script app fed by JotForm
and Google Sheets. It is a different product with different constraints, and
nothing was copied. What it supplied was **evidence about which problems are
real**, which is the part that cannot be reasoned out from first principles.

## Decision

### 1. A table's number is not its position

Venues put number cards on tables in whatever pattern they like: left-to-right,
snake, right-to-left, or by row. Staff must match the screen to the physical
room, or guests are directed to the wrong table.

So numbering is a **rendering scheme applied to positions**, not a property a
user types onto each table:

- A numbering scheme maps a table's position in the plan to a number.
- Applying a scheme changes **labels only**. No guest moves.
- Moving guests between tables is a **separate, explicit action**.

The reference system learned this the hard way. Its first design tracked
position swaps in a side structure, and swapping two tables and then swapping
them back failed — the swap layer recorded the reverse instead of cancelling.
The fix was deleting the side structure and reassigning the real data.

**The general lesson, and the rule here: never keep a shadow mapping alongside
the truth.** A scheme is computed from positions on demand and stored nowhere.

### 2. Seat assignment locks separately from element locking

Elements already carry `locked`, which prevents moving them on the plan. Seat
assignments need their own lock: once seating is finalised a week before the
event, importing an updated guest list must not reorganise everyone.

These are different concerns and a user needs them independently — a plan whose
furniture is still being moved can have settled seating, and vice versa.

### 3. Re-import reconciles; it never replaces

A planner receives an updated guest list days before the event. If importing it
clears the seating, the tool is worthless at exactly the moment it matters.

Import therefore matches incoming rows against existing guests on a stable key,
keeps every assignment it can, adds new guests unseated, and flags departures
for the user to confirm. A preview shows what will change before anything does.

### 4. A group has a host

Guests arrive as groups — a company, a household, a family — and a group has
someone who matters most: the table host, whose seat determines where the group
sits. Modelling groups as a flat tag loses that, and sponsor tables need it.

A group larger than its table splits with a warning rather than silently.

## Consequences

**Seats are addressed as `(elementId, seatIndex)`**, exactly as
[ADR-0012](ADR-0012-seat-generation.md) established. A guest holds that pair;
seats remain generated, never stored.

**Shrinking a table can orphan an assignment.** A guest in seat 9 of a table
reduced to 8 becomes unseated rather than silently discarded, and the UI has to
say so — a guest who quietly loses their seat is worse than one who was never
seated.

**Constraints stay small.** Groups express "sit together"; explicit pairwise
rules express "do not seat these two together". Nobody is entering pairwise
rules for 200 guests, so the group is the workhorse and the pairwise rule is the
exception.

**Day-of stays printed.** Find-my-seat lists, per-table sheets, place cards, and
a check-in sheet to tick by hand — but no live check-in state. Live status is a
different product, and one that cannot work when two staff have no server to
share.

## Rejected alternatives

| Option                            | Why not                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guests as document elements**   | They have no geometry. Putting them in the element list would give the renderer, the spatial scan, and the undo stack something to reason about that never appears on the plan. |
| **Seat objects stored per table** | Contradicts ADR-0012 and reintroduces the 3,500-element theatre layout it exists to prevent.                                                                                    |
| **Pairwise constraints only**     | Flexible and unusable: nobody enters 200 pairs for a wedding.                                                                                                                   |
| **Numbering typed per table**     | What the app does today. Forty tables is forty pieces of typing, and renumbering after a layout change is entirely manual.                                                      |
| **Live check-in**                 | A different product. Serverless means two staff cannot share state, which is precisely what check-in needs.                                                                     |

## Reverse if

Real use shows planners want live day-of state badly enough to accept a server.
That is a product decision, not a technical one, and it would reopen the
premise in [ARCHITECTURE.md](../ARCHITECTURE.md) rather than just this ADR.
