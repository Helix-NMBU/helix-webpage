# Member CV delivery

Updated 25 October 2026. Coordinator worktree: `/private/tmp/helix-login-02`.

## Scope and repository

- Repository: Helix-NMBU/helix-webpage. Base: `main`, captured at `396e8a14c50f41ac4a27c8341b5095de29c6d5c9`.
- Existing integration branch: `cursor/neon-member-cv-portal-d2e1`. The coordinator checkout is detached; preserve this existing branch and history.
- Existing PR: https://github.com/Helix-NMBU/helix-webpage/pull/62. Leave it unmerged.
- Starting release: `240609314e37f6562c4bc0d6911a5b14d1dc58f4`, deployed at https://internal.helixnmbu.no.
- Tracker: Linear, Sponsor portal MVP, Member CV milestone. Issues HELIX-8, HELIX-9, HELIX-23 and HELIX-10.
- Approved scope: the milestone's issue criteria plus the user's subsequent profile/CV, English interface, manual Norwegian/English CV translation, shadcn and internal-platform instructions. These override historical interface requirements in spec revision 11. No profile images, sponsor directory UI, AI integration or further CV redesign.
- User authorized completing the issues, closing verified issues and preparing one reviewable PR. HELIX-10 explicitly stays open until the accepted PR merges. No merge is authorized.

## Ticket state

| Issue | Work and dependencies | Current evidence and remaining work |
| --- | --- | --- |
| HELIX-8 | Account ownership on tab focus and before CV requests; blocks HELIX-10 | Fix `f68e8dc` is part of the deployed release. Automated session regressions exist. Two-real-account browser verification remains required; user asked about a second account. |
| HELIX-9 | Google sign-in, callback, reload/focus, logout, expiry, rejected identity, unavailable-service recovery; blocks HELIX-10 | Previously verified actual Helix sign-in, reload and anonymous API rejection. Complete current-commit browser matrix and separate injected failures from real OAuth evidence. |
| HELIX-23 | Profile/CV scope, desktop/mobile, shadcn, internal/public routing | Desktop/mobile local browser flows and actual generated PDF checked; live auth/profile read checked. Component choices in verification.md. Close after repaired PR checks pass. |
| HELIX-10 | Full PR review, CI, prerequisites, older #51/#57 reconciliation; depends on HELIX-8/9 | Main integrated without rewriting history. Independent review findings repaired. Current PR checks and remaining human acceptance pending. Do not close before merge. |
| HELIX-28 | Newly discovered installed-SDK focus defect, child of HELIX-9 | Fix 1624930 uses direct endpoint invocation and ends access on SDK-thrown 401/403. Four installed-SDK regressions pass. Independent re-review and live verification pending. The connector rejected assigning the existing milestone, so this is linked through parent HELIX-9. |

## Current execution

- No implementation workers dispatched. Coordinator handled integration and verification. Three fresh read-only agents reviewed correctness, Spec and Standards independently.
- Main integration committed as 865e79f. Existing scripts and deployment safeguards preserved. Initial review fixes committed as 81f20d6, SDK focus repair as 1624930.
- Current validation: 425 Vitest tests and two Node deployment-guard tests, lint, all three TypeScript checks and build passed. Static output 8.91 MB. Browser and SQL evidence, exact limitations and reviewer records are in verification.md.
- Migration 002 adding the optional administrator-owned Helix role was explicitly approved and applied during the preceding release. Migration 001 and runtime configuration were already active. No live schema mutation is planned here.
- Linear get_agent_context is advertised but returns Tool not found. Issue descriptions remain available.

## Review and final gates

Full-feature review and initial repair re-review passed at 81f20d6. Independent correctness and Spec re-review passed the SDK repair at 1624930. GitHub checks, no-conflict confirmation and repository rules must still be recorded on the final remote revision. Automatic approval review rejected converting the existing PR to draft, so its existing non-draft state was preserved. Do not retry that state change through another tool. A green Vercel status alone does not establish full CI coverage.

## Next action

Finish SDK re-review, publish the existing branch, wait for current checks, verify repaired live session flow and update Linear with evidence. Leave two-real-account and incomplete live auth acceptance open. Human review/merge is the final step for HELIX-10.
