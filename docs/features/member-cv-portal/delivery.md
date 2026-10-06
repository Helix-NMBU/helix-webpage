# Member CV portal delivery

Repository: Helix-NMBU/helix-webpage. Tracker: GitHub Issues; parent #51, T-00 #52, T-01 #53, T-02 #54, T-03 #55, T-04 #56. See tracker.json.
Spec: spec.md revision 1, selected for implementation through user `$deliver` invocation.
Base: sponsor-portal-v2, f99939dfadaa43d869ad6429034608f0bc7f9429.
Integration branch: codex/member-cv-portal.
Integration worktree: /private/tmp/helix-member-cv-portal.
Existing dependency PR: https://github.com/Helix-NMBU/helix-webpage/pull/46, verified open/Draft; unchanged.
New feature PR: https://github.com/Helix-NMBU/helix-webpage/pull/57. Open/Draft, reviewer joasmund requested. Attached to the current Codex chat.
T-00: verified at 0070630; three domain tests and frontend typecheck passed.
Workers assigned from 0070630:
- /root/backend: T-01 #53, /private/tmp/helix-member-cv-backend, codex/member-cv-backend.
- /root/editor: T-02 #54, /private/tmp/helix-member-cv-editor, codex/member-cv-editor.
- /root/pdf: T-03 #55, /private/tmp/helix-member-cv-pdf, codex/member-cv-pdf.
T-04 #56: integrated and independently reviewed; automatic Vercel preview failure prevents final readiness.
Each worker is restricted to its own worktree and bounded change areas. Root owns runtime integration, sponsor PDF download/preview changes, SQL integration harness and CI.
Review: three independent reports completed at 79b73a9. Verification: local checks and browser review completed; see below.
Live Google and Supabase access have not been configured or tested. Do not deploy or merge.
Next action: obtain the failed Vercel build log, repair any confirmed cause, re-review changed code and verify current-commit checks before marking PR #57 ready. GitHub connector write returned 403; authorized GitHub CLI creation succeeded and IDs were read back. Docker is unavailable; local PostgreSQL policy verification uses PGlite with explicitly emulated Supabase schemas.

## Integrated implementation and verification

- T-03 #55: worker /root/pdf commit 7fa6ccb, integrated 431bb98. Nine real-PDF tests passed on integrated code. Four-page sample /private/tmp/helix-member-cv-sample.pdf, all pages visually inspected; licensed Noto Sans assets bundled.
- T-02 #54: worker /root/editor commit 0292c80, integrated f3ea337. Fifteen repository/demo behavior tests and frontend typecheck passed after integration.
- T-01 #53: worker /root/backend commit 7079e6f, integrated aacb226. Twenty-seven HTTP/login tests plus seven real PostgreSQL role/publication scenarios pass.
- Full integrated verification before review: 85 tests/9 files passed; frontend/API typecheck, lint, build passed. Vite's existing chunk-size warning remains.
- A local harness cleanup issue initially caused failures after expected SQL permission errors; fixed rollback order, then the full suite passed. This was test-fixture behavior, not a production database change.
- Browser review on 2026-10-06: 1280px desktop and 390px mobile. Fictional fill, Nordic name input, private save, publish, private edit/save with published version retained, redacted preview, republish, withdrawal, reload persistence, logout and return to draft were observed. Screenshots /private/tmp/member-cv-desktop.jpg and /private/tmp/member-cv-mobile.jpg. Browser tab shows local demo at http://127.0.0.1:5177/member/profile?demo=1; local server session 73704 remains running.
- Runtime entrypoint is coordinator-owned api/member-cv.ts. Sponsor viewing now fetches authenticated Storage blobs rather than issuing signed CV URLs. Existing avatars are retained during publication; final profile image editing remains deferred.
- Reviewer assignments and reviewed commit: /root/review_correctness, /root/review_spec and /root/review_standards independently reviewed 79b73a9 against f99939d. None participated in implementation.
- Live Google/Supabase project configuration, migration application and actual Storage transport checks remain rollout prerequisites. No live database was mutated and no manual deployment was performed.

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

Full feature review is bound to 2cb5807, supplemented by independent emitted-runtime repair review at b846e39. Initial Standards and Spec reports are preserved above; the full reviewer independently verified all affected repairs. The runtime import repair and its CI guard are independently reviewed; subsequent changes are documentation only. Live Google/Supabase/Storage verification is still required before rollout.

PR #57 was created as draft against sponsor-portal-v2 and attached. PR #46 remains unchanged and unmerged. The branch has no applicable required protection rules and was mergeable when checked, but the automatic Vercel preview failed, so the final delivery gate remains unmet.

## Remote verification and remaining blocker

At remote commit c1d4909d0e18c45ce839ea790379eca01e7c8167, both GitHub Member CV checks succeeded. PR workflow run 37522362734 independently reported 103 tests in 11 files, both typechecks, lint and build. The automatic Vercel status failed for deployment dpl_384NBCDssaZkGKM2RXEtGxQV8HRE. No failure cause has been confirmed.

Build diagnostics belong to Vercel scope jacob14-fe28. The local CLI lists only helix-nmbu; inspect under that context cannot find the deployment and inspect under jacob14-fe28 reports an unavailable scope. The browser diagnostic link requires login. The coordinator asked the user to paste the Build Logs error and assigned /root/backend a bounded, local-only Vercel function-build reproduction. No deployment, project linking or remote settings changes were requested or performed.

T-04 #56 and parent #51 remain open. Keep PR #57 draft while this preview failure is unresolved. Local demo remains at http://127.0.0.1:5177/member/profile?demo=1. Code review and local verification are complete, but delivery is not fully complete until the current remote preview check is resolved and readiness is reverified.

## Emitted runtime repair after preview investigation

The bounded local function build emitted all seven endpoints and traced both licensed fonts into the CV bundle. A separate materialized-runtime smoke reproduced ERR_MODULE_NOT_FOUND because the PDF renderer imported the shared model without .js. Worker 942a1e0 fixed model.js/types.js imports, integrated as 825eed8. This does not establish the cause of the automatic preview build failure, whose log remains unavailable.

Coordinator commit b846e39 adds source-only NodeNext checking, the matching erased type import and CI command. The new check failed on the old imports and passed after repair. Full integration revalidation again passed 103 tests in 11 files, all three typechecks, lint, build and diff checks. The materialized Vercel function imports its handler and renderer and generates a valid 13,149-byte Nordic PDF using only bundled fonts. No external service or project configuration was used for this smoke. Logs and temporary reproduction scripts are under /private/tmp/helix-vercel-function-evidence and /private/tmp/vercel-function-repro.cjs.

T-03 #55 was reopened when the emitted runtime failure invalidated its deployment criterion. It closed again after independent review of b846e39 confirmed the fix and reran the runtime check, nine PDF tests and materialized bundle smoke. T-04 and the parent remain open while the actual automatic preview check fails.

Final source review: /root/review_correctness inspected b846e39 against c1d4909. No material finding; NodeNext guard includes production API dependencies and excludes tests. The reviewer independently loaded the materialized handler and generated a Nordic PDF from bundled fonts. Current remote checks will be re-read after this documentation checkpoint is pushed. Keep the PR draft unless the preview gate also passes.
