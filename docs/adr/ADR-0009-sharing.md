# ADR-0009 — Read-only sharing via URL fragment, no server

**Status:** Accepted · 2026-08-08

## Context

Research ranked broken client review as the second-biggest pain point. Users
described exporting a PDF and emailing it to get feedback; where sharing does
exist, clients "do not understand the functions or make changes without informing
the creator."

Both halves matter: sharing must be easy, and the shared copy must not be able to
silently mutate the original.

## Decision

Encode the compressed document into the **URL fragment** (`#`) and share that
link.

The fragment is never transmitted to any server — not in the request, not in
access logs, not to a CDN. It stays entirely client-side, which is what makes
serverless sharing possible without quietly becoming a hosting product.

Opening a share link yields an explicitly **read-only** view with an obvious
"open a copy to edit" action. The recipient can look, comment verbally, and
cannot overwrite anything.

Above a size threshold, URLs become impractical. The app then says so plainly and
offers the `.floored` file instead. **The threshold is measured, not guessed** —
a Phase 8 task.

## Rejected alternatives

| Option                           | Why not                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Hosted share links               | Requires a server, storage, and moderation. Becomes a running cost and a liability. |
| Query string instead of fragment | Query strings _are_ sent to servers and logged. Defeats the privacy property.       |
| PDF-only sharing                 | What users already do, and already complain about.                                  |
| Editable share links             | Reproduces the exact complaint about clients changing plans unannounced.            |

## Consequences

- Compression choice matters directly for how large a plan can be shared.
- Share links are opaque and unlisted; they are not secret. Documented as such —
  anyone with the link sees the plan.
- Guest names travel inside share links. The UI must warn before sharing a plan
  containing a guest list, since that is personal data leaving the user's hands.

## Reverse if

Measured thresholds prove too small to be useful for realistic plans, in which
case an optional, self-hostable share service becomes a separate opt-in
component — never a dependency of the core app.
