# Security policy

## Reporting a vulnerability

Use GitHub's [private security advisory](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
flow. Do not open a public issue.

You'll get an acknowledgement within 7 days and an assessment within 14. Fixes
for confirmed issues ship as soon as they're ready, with credit unless you'd
rather not have it.

## Threat model

Floored has no server, no accounts, and no telemetry. There is no backend to
breach and no user database to leak. That removes most of the usual categories
and leaves a smaller, specific set:

| Concern                       | Where it applies                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| Malicious `.floored` file     | Parsing an untrusted document must not execute anything or exhaust memory                                |
| Malicious CSV guest import    | Parser resource exhaustion; names that reach the PDF, the canvas, and the DOM                            |
| Untrusted SVG or image import | SVG can carry scripts — must be sanitized before render                                                  |
| Share-link payloads           | Fragment content is untrusted input and is parsed like any other document                                |
| Supply chain                  | A compromised dependency ships directly to users; see [ADR-0010](docs/adr/ADR-0010-dependency-policy.md) |
| XSS via user-supplied text    | Guest names, table labels, event titles all reach the DOM and the canvas                                 |

## Privacy note that matters more than it looks

Share links encode the document — **including the guest list** — into the URL
fragment. The fragment is never sent to a server, but the link itself is personal
data the moment a guest list exists in the plan.

The app warns before generating a share link for a plan containing guests. If you
find a path where it doesn't, that's a security bug, report it.

## Supported versions

Pre-1.0: only `main` is supported. After 1.0, the latest minor of the current
major receives security fixes.
