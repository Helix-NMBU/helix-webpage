# Partner portal navigation delivery

Status: main-based release candidate; local checks passed
Issue: HELIX-30
Target branch: main
Base: 43e5ef7c2f4714eaa5d183ecade718cb5ca53fdf

## Scope

Integrate responsive Talent Directory and Engagement Requests navigation into the active Neon partner portal. Preserve current invitation sign-in and server-side organization and agreement checks. Keep the existing request workflow as the shared Helix admin queue.

## Verification

- `npm run typecheck` — passed
- `npm run typecheck:api` — passed
- `npm run typecheck:api:runtime` — passed
- `npm run lint` — passed
- `npm test` — 942 tests passed; deployment guard tests passed
- `npm run build` — passed; static output is 9.17 MB / 10 MB
- Targeted partner API tests ran against PGlite with migrations 008 and 009, including entitlement checks, cross-organization denial, expired access, and the shared admin queue.
- Local browser inspection confirmed the workspace sidebar, active Engagement Requests state, and shared conversation detail. The screenshot uses a temporary localhost-only review fixture and does not claim a live authenticated session.
- Migration 009 must be applied to Neon before the request API is available after deployment.
- No authenticated hosted session or mobile-sized browser session was used for this release candidate.

An independent review found and verified fixes for entitlement-less organization access, post-save refresh errors, and the eligible-organization selector. No open review findings remain.
