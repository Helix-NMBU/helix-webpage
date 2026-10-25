# Sponsor portal delivery

Started 25 October 2026. Repository: Helix-NMBU/helix-webpage. Approved scope: acceptance.md plus the user's answers recorded in HELIX-11/12/14/17/18. No cloud agents were launched; the user switched to local implementation.

Base: PR #62, branch cursor/neon-member-cv-portal-d2e1, commit 60edbc1216df7f16fefe333d7fcdbd3aa1933f4f. Integration checkout: /private/tmp/helix-sponsor-mvp-20261025, detached HEAD. No named branches created. No sponsor PR exists for this run. Do not push or alter the unmerged member PR.

## Assignments

| Issues | Worker | Checkout | State |
| --- | --- | --- | --- |
| HELIX-11, then HELIX-12/13 | /root/foundation | /private/tmp/helix-sponsor-foundation-20261025 | Architecture contract first; runtime waits for integrated contract |
| HELIX-17, then HELIX-18 | /root/request_contract | /private/tmp/helix-sponsor-requests-20261025 | Request contract/model; runtime waits for authorization dependencies |
| HELIX-20/21/22 preparation | /root/pilot_preparation | /private/tmp/helix-sponsor-directory-20261025 | Non-mutating preflight and pilot evidence plan |
| HELIX-14/15/16 integration and UI | /root | /private/tmp/helix-sponsor-mvp-20261025 | Wait for shared access contract |

## Known remaining gates

- Cloud setup is no longer relevant.
- User approved one-time invitation login, programme/year/department/skills filters and shared email/phone actions, and the six-state shared request workflow.
- HELIX-11 must settle exact API/data ownership; HELIX-17 must settle mutation/state transitions before dependent code.
- Sponsor authentication must be enabled/configured in an authorized environment. Keep member Google authentication unchanged.
- Commercial package approval and sponsor hostname remain rollout details.
- Real-account HELIX-8/9 acceptance, PR #62 acceptance/merge, configured pilot roles and named support/sign-off owners remain external pilot gates.

No implementation issue is closed at this checkpoint. Full verification, independent review and browser evidence are pending.

## Integrated contracts

- Architecture/schema/types: worker 68d676e integrated as 7ccbfdd after coordinator review. Managed Neon email links, atomic invited identity binding, current server grants, explicit staff and shared published-data authorization paths are agreed. Sponsor runtime is still in progress.
- Request workflow: worker cb01697 integrated as 1497838 after coordinator review. Its 102 contract tests passed on the integration checkout. Required fields, actor transitions, assignment, terminal-state behavior and optimistic concurrency are specified in requests.md.
- Dependencies installed successfully with npm ci. The first restricted install stalled; it was stopped and retried with network permission. Existing dependency peer/deprecation warnings remain; no lockfile change was made.

## Final local implementation

The earlier assignment/checkpoint states above are historical. All implementation workers finished and their changes were integrated serially. Current code is 13449337c88a867994f801f7d349d44789319e21. Detailed command, SQL, desktop/mobile browser, PDF and review evidence is in verification.md.

| Issues | Integration evidence | Final local state |
| --- | --- | --- |
| HELIX-11 | 7ccbfdd, architecture.md; three independent reviews | Architecture complete |
| HELIX-12/13 | 5e1366d, d576c8d; actual SQL and installed-SDK tests | Access/entitlement code complete; HELIX-12 live email roundtrip remains open |
| HELIX-14/15 | 32d1071, ea70676, 27bced2; SQL, UI and browser/PDF evidence | Implementation verified |
| HELIX-16 | 66f1e1f, 1344933; SQL and browser create/edit/deactivate/agreement/revoke | Implementation verified |
| HELIX-17/18 | 1497838, d13e856, 4f16423; atomic SQL and complete sponsor/admin browser conversation | Implementation verified |
| HELIX-20/21/22 | 8d22631, f838d10; preflight and pilot checklist | Preparation/local acceptance recorded; live configuration and named pilot ownership remain open |

All 665 Vitest tests plus two Node checks, all three TypeScript checks, repository JavaScript lint and the 9.08 MB production build pass. Correctness, Spec and Standards reviews have zero unresolved material findings at 1344933. Repair b64f201 preserves unsent replies after operation-specific denial and scopes all theme surfaces; 1344933 preserves native date values and bounds test concurrency.

No sponsor branch, push, PR, merge, deployment, live database mutation or invitation email was performed. Member PR #62 remains independent and unmerged. Integration checkout is a retained Git worktree, with all changes committed. Next action is an explicitly authorized live environment setup and acceptance run after hostname, participants, support/sign-off owners and the external member gates are supplied.

Linear was reconciled after verification: HELIX-11/13/14/15/16/17/18 are Done for their verified implementation; HELIX-12 is In Review for the live email roundtrip; HELIX-20/21 are In Progress for live environment/acceptance; HELIX-22 remains Backlog for named ownership and readiness approval. Project evidence is https://linear.app/helixnmbu/document/sponsor-portal-local-implementation-25-october-2026-295f1c83dd25.
