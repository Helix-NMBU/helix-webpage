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
