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

Status: in progress. PR #57 is open/Draft. Current GitHub checks passed at c1d4909 with 103 tests; automatic Vercel preview failed and its owner-scoped build log is unavailable to this session. Parent #51 remains open. Obtain the build error, repair confirmed cause, rerun checks and review changed code before closing this ticket.
