# Member CV portal delivery

Repository: Helix-NMBU/helix-webpage. Tracker: GitHub Issues; parent #51, T-00 #52, T-01 #53, T-02 #54, T-03 #55, T-04 #56. See tracker.json.
Spec: spec.md revision 1, selected for implementation through user `$deliver` invocation.
Base: sponsor-portal-v2, f99939dfadaa43d869ad6429034608f0bc7f9429.
Integration branch: codex/member-cv-portal.
Integration worktree: /private/tmp/helix-member-cv-portal.
Existing dependency PR: https://github.com/Helix-NMBU/helix-webpage/pull/46, verified open/Draft; unchanged.
New feature PR: not created.
T-00: verified at 0070630; three domain tests and frontend typecheck passed.
Workers assigned from 0070630:
- /root/backend: T-01 #53, /private/tmp/helix-member-cv-backend, codex/member-cv-backend.
- /root/editor: T-02 #54, /private/tmp/helix-member-cv-editor, codex/member-cv-editor.
- /root/pdf: T-03 #55, /private/tmp/helix-member-cv-pdf, codex/member-cv-pdf.
T-04 #56: blocked on worker integration.
Each worker is restricted to its own worktree and bounded change areas. Root owns runtime integration, sponsor PDF download/preview changes, SQL integration harness and CI.
Review: not started. Verification: not started.
Live Google and Supabase access have not been configured or tested. Do not deploy or merge.
Next action: complete coordinator integration groundwork while workers implement. GitHub connector write returned 403; authorized GitHub CLI creation succeeded and IDs were read back. Docker is unavailable; local PostgreSQL policy verification will use PGlite with explicitly emulated Supabase schemas.

## Integrated implementation and verification

- T-03 #55: worker /root/pdf commit 7fa6ccb, integrated 431bb98. Nine real-PDF tests passed on integrated code. Four-page sample /private/tmp/helix-member-cv-sample.pdf, all pages visually inspected; licensed Noto Sans assets bundled.
- T-02 #54: worker /root/editor commit 0292c80, integrated f3ea337. Fifteen repository/demo behavior tests and frontend typecheck passed after integration.
- T-01 #53: worker /root/backend commit 7079e6f, integrated aacb226. Twenty-seven HTTP/login tests plus seven real PostgreSQL role/publication scenarios pass.
- Full integrated verification before review: 85 tests/9 files passed; frontend/API typecheck, lint, build passed. Vite's existing chunk-size warning remains.
- A local harness cleanup issue initially caused failures after expected SQL permission errors; fixed rollback order, then the full suite passed. This was test-fixture behavior, not a production database change.
- Browser review on 2026-10-06: 1280px desktop and 390px mobile. Fictional fill, Nordic name input, private save, publish, private edit/save with published version retained, redacted preview, republish, withdrawal, reload persistence, logout and return to draft were observed. Screenshots /private/tmp/member-cv-desktop.jpg and /private/tmp/member-cv-mobile.jpg. Browser tab shows local demo at http://127.0.0.1:5177/member/profile?demo=1; local server session 73704 remains running.
- Runtime entrypoint is coordinator-owned api/member-cv.ts. Sponsor viewing now fetches authenticated Storage blobs rather than issuing signed CV URLs. Existing avatars are retained during publication; final profile image editing remains deferred.
- Reviewer assignments and reviewed commit: pending integration commit capture.
- Live Google/Supabase project configuration, migration application and actual Storage transport checks remain rollout prerequisites. No live project was mutated or deployed.
