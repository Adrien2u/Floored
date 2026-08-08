# ADR-0004 — `.floored`, a documented JSON file format

**Status:** Accepted · 2026-08-08

## Context

Every competitor stores plans as rows in their database. That is the lock-in: the
work is real, and it is not portable. Interop is Floored's differentiator, and it
only counts if the format is documented and stable.

## Decision

A single JSON file, extension `.floored`, with a top-level `schemaVersion`.

- The JSON Schema is published in the repository, not merely implied by code.
- Human-diffable and git-friendly on purpose. A planner can version a season of
  layouts in git if they want to.
- Geometry in integer millimetres ([ADR-0006](ADR-0006-units-and-coordinates.md)).
- One migration function per version bump, chained.

**Compatibility guarantee: every future version of Floored opens every file ever
written by any earlier version.** Stated in the README as a promise and enforced
in CI against a fixture corpus containing a sample file from each released
version. A promise without a test is a wish.

## Rejected alternatives

| Option                       | Why not                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| SQLite in the browser        | Opaque to diff, heavier, solves a scale problem this document does not have.                                         |
| Zip container (like `.docx`) | Justified only once large embedded assets exist. Revisit when floor-plan images are embedded rather than referenced. |
| Binary / MessagePack         | Smaller and faster, and unreadable. Wrong trade for a format whose purpose is portability.                           |
| SVG as the native format     | Presentation, not semantics. Loses seat assignments, constraints, and capacity metadata.                             |

## Consequences

- Export targets (PDF, PNG, SVG) read the document; they are never the document.
- Adding a field is a minor version. Removing or repurposing one requires a
  migration, no exceptions.
- Embedded raster images will eventually push file size up; that is the trigger
  to revisit the zip-container option, not a reason to pre-build it.

## Reverse if

Embedded assets make single-file JSON impractical — the migration is then to a
zip container that still holds the same JSON document inside it.
