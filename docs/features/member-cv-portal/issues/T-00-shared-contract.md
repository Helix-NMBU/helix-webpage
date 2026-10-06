# T-00: shared-contract

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-00. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [x] CV data contract supports repeatable sections and privacy defaults.
- [x] Incomplete drafts accepted; publication requires name and one education institution/degree.
- [x] Malformed/oversized data and non-http(s) links rejected.
- [x] Contact redaction does not mutate private draft.

## Blocking dependencies

None

## Verification

Vitest domain tests, typecheck.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: closed
Integrated at 0070630. Three domain tests and typecheck passed; GitHub #52 confirmed closed.
