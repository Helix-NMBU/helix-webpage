# Member CV portal delivery

Repository: Helix-NMBU/helix-webpage. Tracker: GitHub Issues; parent #51, T-00 #52, T-01 #53, T-02 #54, T-03 #55, T-04 #56. See tracker.json.
Spec: spec.md revision 1, selected for implementation through user `$deliver` invocation.
Base: sponsor-portal-v2, f99939dfadaa43d869ad6429034608f0bc7f9429.
Integration branch: codex/member-cv-portal.
Integration worktree: /private/tmp/helix-member-cv-portal.
Existing dependency PR: https://github.com/Helix-NMBU/helix-webpage/pull/46, verified open/Draft; unchanged.
New feature PR: not created. Review repairs are in progress before publication.
T-00: verified at 0070630; three domain tests and frontend typecheck passed.
Workers assigned from 0070630:
- /root/backend: T-01 #53, /private/tmp/helix-member-cv-backend, codex/member-cv-backend.
- /root/editor: T-02 #54, /private/tmp/helix-member-cv-editor, codex/member-cv-editor.
- /root/pdf: T-03 #55, /private/tmp/helix-member-cv-pdf, codex/member-cv-pdf.
T-04 #56: implementation integrated; independent review repairs pending.
Each worker is restricted to its own worktree and bounded change areas. Root owns runtime integration, sponsor PDF download/preview changes, SQL integration harness and CI.
Review: three independent reports completed at 79b73a9. Verification: local checks and browser review completed; see below.
Live Google and Supabase access have not been configured or tested. Do not deploy or merge.
Next action: integrate isolated review repairs, rerun affected checks and have the fixes independently reviewed, then create one PR. GitHub connector write returned 403; authorized GitHub CLI creation succeeded and IDs were read back. Docker is unavailable; local PostgreSQL policy verification uses PGlite with explicitly emulated Supabase schemas.

## Integrated implementation and verification

- T-03 #55: worker /root/pdf commit 7fa6ccb, integrated 431bb98. Nine real-PDF tests passed on integrated code. Four-page sample /private/tmp/helix-member-cv-sample.pdf, all pages visually inspected; licensed Noto Sans assets bundled.
- T-02 #54: worker /root/editor commit 0292c80, integrated f3ea337. Fifteen repository/demo behavior tests and frontend typecheck passed after integration.
- T-01 #53: worker /root/backend commit 7079e6f, integrated aacb226. Twenty-seven HTTP/login tests plus seven real PostgreSQL role/publication scenarios pass.
- Full integrated verification before review: 85 tests/9 files passed; frontend/API typecheck, lint, build passed. Vite's existing chunk-size warning remains.
- A local harness cleanup issue initially caused failures after expected SQL permission errors; fixed rollback order, then the full suite passed. This was test-fixture behavior, not a production database change.
- Browser review on 2026-10-06: 1280px desktop and 390px mobile. Fictional fill, Nordic name input, private save, publish, private edit/save with published version retained, redacted preview, republish, withdrawal, reload persistence, logout and return to draft were observed. Screenshots /private/tmp/member-cv-desktop.jpg and /private/tmp/member-cv-mobile.jpg. Browser tab shows local demo at http://127.0.0.1:5177/member/profile?demo=1; local server session 73704 remains running.
- Runtime entrypoint is coordinator-owned api/member-cv.ts. Sponsor viewing now fetches authenticated Storage blobs rather than issuing signed CV URLs. Existing avatars are retained during publication; final profile image editing remains deferred.
- Reviewer assignments and reviewed commit: /root/review_correctness, /root/review_spec and /root/review_standards independently reviewed 79b73a9 against f99939d. None participated in implementation.
- Live Google/Supabase project configuration, migration application and actual Storage transport checks remain rollout prerequisites. No live project was mutated or deployed.

## Independent review at 79b73a9

Standards: no actionable findings. Existing React/TypeScript boundaries, explicit domain types and Member Profile/Talent Directory terminology follow project conventions. The editor's size alone did not justify a refactor.

Spec: P1, InterestDialog still issued 900-second signed CV URLs. Sponsors could keep using these after their entitlement ended. Assigned to /root/editor in its isolated worktree to use authenticated Blob downloads and inspect the remaining consumers.

Correctness: two P2 findings reproduced with injected handlers. Pending retired-file cleanup blocked withdrawal before its database transaction. A publication whose RPC and readback both failed left an upload without a durable cleanup record. Assigned to /root/backend in its isolated worktree. Reconciliation must settle the mutation under the document lock before deleting an uncertain candidate.

Reports remain distinct. The initial clean Standards report does not settle the material Spec and correctness findings. T-03 #55 is closed with PDF test and visual evidence. T-01, T-02 and T-04 remain open until the relevant integrated criteria and repairs pass.

- Spec repair: worker 6763495 integrated as 6549a17. The complete-feature reviewer independently rechecked the F-05 fix and ran all five viewer tests. No material regression or reusable signed generated-CV URL remains in sponsor viewers.
- Cleanup warning: worker 16b4b85 integrated as ba599e6. A separate warning preserves successful document/revision state while offering reload to retry cleanup.
- Additional browser verification: a temporary fictional fixture rendered the actual InterestDialog preview controls and access-denied state. The in-app browser did not render the embedded PDF or report its download event, so this is UI evidence only. Real PDF content was inspected separately. Fixture source/server were removed after verification. A temporary fictional cleanup flag rendered the member warning and successful reload action; the source was restored and the ordinary demo remains open. Screenshot /private/tmp/member-cv-cleanup-warning.jpg.

- Backend repair: worker 2665bde integrated as 2cb5807. Upload paths are durable before Storage writes; registration, publication and settlement use the document lock. Cleanup failures preserve successful state through `cleanupPending`; uncertain uploads retain a deferred deletion window. Coordinator integrated verification passed 103 tests in 11 files, including 13 PostgreSQL scenarios and four production adapter fault cases. Frontend/API typechecks, lint, production build and diff checks passed at 2cb5807. The complete-feature reviewer independently reran 48 relevant tests and confirmed both P2 findings and the warning fix are resolved with no new material finding. Setup was updated with the lease, settlement, deferred cleanup and nonblocking response behavior before PR creation.

## Current delivery state

T-00 #52, T-01 #53, T-02 #54 and T-03 #55 are verified on the integration branch and closed with evidence. T-04 #56 remains open for the current-commit remote CI and PR readiness gate. Parent #51 stays open until merge.

Code review is bound to 2cb5807. Initial Standards and Spec reports are preserved above; the full reviewer independently verified all affected repairs. Later changes at this stage are documentation only. Live Google/Supabase/Storage verification is still required before rollout.

Next action: push the reviewed feature branch, create one draft PR against sponsor-portal-v2, attach it to this chat, wait for its current-commit checks and mark ready only after those pass. PR #46 remains unchanged and unmerged.
