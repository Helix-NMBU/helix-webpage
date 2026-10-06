# T-01: backend

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-01. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [x] Verify signed Google ID token audience/expiry/issuer, hosted domain and verified email on server. Self-onboard without members allowlist.
- [x] Stable user ownership enforced; never grant admin access.
- [x] Durable private draft, stale-revision conflict, publish snapshot and withdraw transactions.
- [x] Publication is server-generated PDF and existing Talent Directory projection only updates on publish.
- [x] RLS isolates private data; exact current-file access and old file cleanup; no direct forged-client writes.
- [x] Incremental SQL and setup/rollout docs.

## Blocking dependencies

T-00: https://github.com/Helix-NMBU/helix-webpage/issues/52

## Verification

Injected Google/API lifecycle tests plus integrated PostgreSQL role scenarios.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: closed on the integrated feature branch.

Evidence: Integrated at 2cb5807 after worker 2665bde repaired the independently reproduced cleanup failures. Google/API failure tests, 13 actual PostgreSQL role/publication scenarios and four production cleanup-adapter faults pass on the feature branch. Independent correctness review reran 48 relevant tests and found no remaining material issue. Paths are tracked before upload, uncertain results settle under the publication lock, and cleanup does not prevent draft saves or withdrawal. Setup documents migration/configuration and live rollout checks. No live configuration, migration or deployment was performed.
