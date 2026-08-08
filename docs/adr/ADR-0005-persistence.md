# ADR-0005 — OPFS for working storage, files for portability

**Status:** Accepted · 2026-08-08

## Context

No server means the browser holds the working document. Browser storage is also
evictable, which makes "your work is safe" a claim that needs care rather than
confidence.

The File System Access API offers true save-in-place but is Chromium-only.
Firefox and Safari are supported targets.

## Decision

Layered, degrading gracefully:

1. **OPFS (Origin Private File System)** — working store and autosave. Fast,
   synchronous-ish access handles, no permission prompts.
2. **File System Access API** — used when present, for genuine save-in-place.
   Progressive enhancement only; never depended upon.
3. **Download / file input** — the portable path that works in every browser.

Autosave to OPFS after ~2 seconds of idle. Crash recovery offers the autosaved
document on next load.

**Be loud that the browser is not a filing cabinet.** After meaningful work, the
UI prompts for a real file save. Silent data loss from storage eviction would be
unforgivable in a tool used for events that happen once.

## Rejected alternatives

| Option         | Why not                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB only | Works, but OPFS is a better fit for whole-file blobs and is faster for autosave. IndexedDB remains the fallback if OPFS support gaps appear. |
| localStorage   | ~5 MB limit, synchronous, string-only. Unsuitable.                                                                                           |
| Cloud storage  | Requires a server and an account. The premise of the project is that it needs neither.                                                       |

## Consequences

- Multi-document support is a local document list, no sync.
- Two save paths ("save" vs "save a copy") need clear UI language so users know
  which one produced a file they own.
- Storage-pressure and eviction handling must be tested, not assumed.

## Reverse if

OPFS proves unreliable across supported browsers, in which case IndexedDB
becomes the working store with no change to the layering above it.
