# Architecture decision records

One decision per file. Each records what was decided, what was rejected, and —
most importantly — **what evidence would reverse it**. A decision without a
reversal condition is a belief, not a decision.

| #                                         | Decision                                              | Status   |
| ----------------------------------------- | ----------------------------------------------------- | -------- |
| [0001](ADR-0001-rendering.md)             | Hand-rolled Canvas2D + rbush, dual-canvas             | Accepted |
| [0002](ADR-0002-framework.md)             | Svelte 5 + Vite + TypeScript strict                   | Accepted |
| [0003](ADR-0003-document-and-undo.md)     | Plain document, immutable updates, command-stack undo | Accepted |
| [0004](ADR-0004-file-format.md)           | `.floored` JSON with permanent backward compatibility | Accepted |
| [0005](ADR-0005-persistence.md)           | OPFS primary, download/upload portable path           | Accepted |
| [0006](ADR-0006-units-and-coordinates.md) | Integer millimetres internally                        | Accepted |
| [0007](ADR-0007-to-scale-pdf.md)          | pdf-lib vector export, never rasterized               | Accepted |
| [0008](ADR-0008-pwa-and-offline.md)       | Workbox PWA, prompt-to-update                         | Accepted |
| [0009](ADR-0009-sharing.md)               | Read-only share via URL fragment, no server           | Accepted |
| [0010](ADR-0010-dependency-policy.md)     | Permissive licences only, verified at source          | Accepted |

## Format

```markdown
# ADR-000N — Title

Status · Context · Decision · Rejected alternatives · Consequences · Reverse if
```

Superseded ADRs are kept, marked `Superseded by ADR-XXXX`, never deleted. The
reasoning that turned out wrong is worth more than the file it occupies.
