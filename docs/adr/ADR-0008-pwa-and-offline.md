# ADR-0008 — PWA with Workbox, prompt-to-update

**Status:** Accepted · 2026-08-08

## Context

The app must work offline — venues have poor connectivity, and the project
promises no dependency on a server. It must also install to the Windows Start
menu, which is what replaces the native-desktop packaging the original brief
called for.

## Decision

Vite PWA plugin (Workbox). Precache the entire application shell; it is small and
fully static, so there is no partial-offline state to reason about.

**Updates prompt the user. They never reload silently.** A silent reload while
someone is mid-edit is data loss, and this app's users are working against a
fixed event date.

## Rejected alternatives

| Option                     | Why not                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Hand-rolled service worker | Cache invalidation is a known trap with a good library solution. Not the place to be clever.                  |
| No PWA                     | Loses offline operation and Start-menu install — two of the three things the native build was wanted for.     |
| Auto-reload on new version | Data loss risk during editing.                                                                                |
| Electron / Tauri now       | Reintroduces installers, signing, and updates. Tauri stays a post-1.0 option wrapping the identical frontend. |

## Consequences

- Installed PWA gives a Start-menu entry, its own window, and its own icon —
  the practical benefits of "native" without any packaging pipeline.
- Offline must be tested with the network genuinely disabled, in CI where
  possible.
- Version skew between a cached shell and a newer document format is a real
  case; the format's compatibility guarantee ([ADR-0004](ADR-0004-file-format.md))
  covers reading, and the update prompt covers the rest.

## Reverse if

A hard requirement appears that a PWA cannot satisfy — deep OS file
associations, or printer control beyond what the browser exposes. Tauri is then
the answer, wrapping the same frontend.
