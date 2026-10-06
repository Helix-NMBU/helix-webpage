# T-04: integration

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-04. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [ ] Wire runtime backend and PDF renderer, integrate editor and existing Talent Directory.
- [ ] Verify role/RLS isolation, publication lifecycle and stale revisions on integrated code.
- [ ] Verify rendered editor desktop/mobile and actual generated PDF.
- [ ] Run full relevant tests, frontend/API typechecks, lint/build and independent full code review.
- [ ] Create one PR targeting sponsor-portal-v2; check current-commit CI/rules; leave unmerged and record real rollout gaps.

## Blocking dependencies

T-01: https://github.com/Helix-NMBU/helix-webpage/issues/53; T-02: https://github.com/Helix-NMBU/helix-webpage/issues/54; T-03: https://github.com/Helix-NMBU/helix-webpage/issues/55

## Verification

Integrated checks, browser evidence, independent review, PR current-commit CI.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: ready
