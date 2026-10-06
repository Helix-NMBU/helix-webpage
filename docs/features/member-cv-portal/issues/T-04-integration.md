# T-04: integration

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-04. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [x] Wire runtime backend and PDF renderer, integrate editor and existing Talent Directory.
- [x] Verify role/RLS isolation, publication lifecycle and stale revisions on integrated code.
- [x] Verify rendered editor desktop/mobile and actual generated PDF.
- [x] Run full relevant tests, frontend/API typechecks, lint/build and independent full code review.
- [x] Create one PR targeting sponsor-portal-v2; check current-commit CI/rules; leave unmerged and record real rollout gaps.

## Blocking dependencies

T-01: https://github.com/Helix-NMBU/helix-webpage/issues/53; T-02: https://github.com/Helix-NMBU/helix-webpage/issues/54; T-03: https://github.com/Helix-NMBU/helix-webpage/issues/55

## Verification

Integrated checks, browser evidence, independent review, PR current-commit CI.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: closed. PR #57 is open, ready for review and unmerged. GitHub push/PR checks and the Vercel preview passed at remote 9d8dabb7703563dd854cb3e539e0506ccbdd3273. The PR is mergeable with merge state CLEAN and no applicable branch protection rules. Reviewer joasmund is requested; no human approval is claimed. The independent source reviews cover 2cb5807, b846e39 and 97f2940. Final local verification passed 103 tests, all three typechecks, lint, build and diff checks after a clean npm install. GitHub #56 was closed with this evidence and read back as CLOSED on 2026-10-06. Parent #51 remains open, and dependency PR #46 remains draft. Live Google/Supabase configuration, migration application and Storage/login checks remain prerequisites before rollout. See setup.md and delivery.md.
