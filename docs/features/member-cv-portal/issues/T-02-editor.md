# T-02: editor

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-02. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [ ] CV editor supports contact, summary, repeatable education, experience, Helix projects, skills, languages, links.
- [ ] Save draft, PDF preview/download, publish, republish, withdrawal and logout with clear status.
- [ ] Retain unsaved input on API failure; clear revision conflicts.
- [ ] Server-verified Google login then Supabase session; profile access does not depend on active members register.
- [ ] Desktop/mobile development-only fictional demo is clearly labeled and isolated from live data.

## Blocking dependencies

T-00: https://github.com/Helix-NMBU/helix-webpage/issues/52

## Verification

Repository behavior tests, typecheck/build and integrated desktop/mobile browser verification.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: ready
