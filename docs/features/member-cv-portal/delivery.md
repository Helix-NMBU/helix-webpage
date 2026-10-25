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
| HELIX-23 | Profile/CV scope, desktop/mobile, shadcn, internal/public routing | Core implementation shipped. Verify editing, translation, PDF and publication lifecycle. Document component choices and gaps. |
| HELIX-10 | Full PR review, CI, prerequisites, older #51/#57 reconciliation; depends on HELIX-8/9 | PR open with conflicts. Merge main into existing worktree, verify, obtain fresh independent code review, update this PR. Do not close before merge. |

## Current execution

- No implementation workers dispatched. Coordinator handles integration and browser verification; fresh read-only reviewers will inspect the complete integrated diff.
- Main integration started. Only conflict is package.json scripts. Preserve the member dev command and test/typecheck commands alongside the deployment-size guard.
- Existing release validation: 417 Vitest tests and two Node deployment-guard tests, lint, all three TypeScript checks and build passed before this run. This is historical evidence until the integration is rechecked.
- Migration 002 adding the optional administrator-owned Helix role was explicitly approved and applied during the preceding release. Migration 001 and runtime configuration were already active. No live schema mutation is planned here.
- Linear get_agent_context is advertised but returns Tool not found. Issue descriptions remain available.

## Review and final gates

Pending: complete-feature independent review, current-commit local checks and GitHub checks, no conflicts, unresolved review threads and repository rules check. Record exact reviewed and remote commits here. A green Vercel status alone does not establish full CI coverage.

## Next action

Finish main integration, run checks, verify the browser flows, fix discovered defects and obtain independent review. Record real-account access limits explicitly. Close only criteria that are actually verified.
