# T-02: editor

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-02. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [x] CV editor supports contact, summary, repeatable education, experience, Helix projects, skills, languages, links.
- [x] Save draft, PDF preview/download, publish, republish, withdrawal and logout with clear status.
- [x] Retain unsaved input on API failure; clear revision conflicts.
- [x] Server-verified Google login then Supabase session; profile access does not depend on active members register.
- [x] Desktop/mobile development-only fictional demo is clearly labeled and isolated from live data.

## Blocking dependencies

T-00: https://github.com/Helix-NMBU/helix-webpage/issues/52

## Verification

Repository behavior tests, typecheck/build and integrated desktop/mobile browser verification.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: closed on the integrated feature branch.

Evidence: Integrated editor f3ea337 and repairs 6549a17/ba599e6, verified together at 2cb5807. Repository/demo and authenticated viewer tests passed. Desktop/mobile fictional browser flow covered saving, separate publication, redacted preview, republishing, withdrawal, persistence and logout. The cleanup warning/reload action was rendered under a temporary fictional flag, then source restored. Independent review confirmed successful state is preserved and remaining sponsor viewers fetch through current authenticated access. Live Google/Supabase checks remain a rollout prerequisite.
