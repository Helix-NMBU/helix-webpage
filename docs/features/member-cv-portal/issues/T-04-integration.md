# T-04: integration

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-04. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [x] Wire runtime backend and PDF renderer, integrate editor and existing Talent Directory.
- [x] Verify role/RLS isolation, publication lifecycle and stale revisions on integrated code.
- [x] Verify rendered editor desktop/mobile and actual generated PDF.
- [x] Run full relevant tests, frontend/API typechecks, lint/build and independent full code review.
- [ ] Create one PR targeting sponsor-portal-v2; check current-commit CI/rules; leave unmerged and record real rollout gaps.

## Blocking dependencies

T-01: https://github.com/Helix-NMBU/helix-webpage/issues/53; T-02: https://github.com/Helix-NMBU/helix-webpage/issues/54; T-03: https://github.com/Helix-NMBU/helix-webpage/issues/55

## Verification

Integrated checks, browser evidence, independent review, PR current-commit CI.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: in progress. PR #57 is open/Draft. Current GitHub checks passed at 9eadbc3 with 103 tests. The accessible Vercel log confirmed an obsolete pnpm lock blocked the function dependency install. Repair 97f2940 removes only that lock, preserves the npm dependency graph and passes independent review plus clean npm install/full checks. Final current-commit preview verification remains pending. Parent #51 stays open.
