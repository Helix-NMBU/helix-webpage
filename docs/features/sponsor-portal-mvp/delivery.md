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

No implementation issue is closed at this checkpoint. Integration, tests, independent review and browser evidence are pending.
