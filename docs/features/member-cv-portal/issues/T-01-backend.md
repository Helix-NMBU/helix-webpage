# T-01: backend

Parent: https://github.com/Helix-NMBU/helix-webpage/issues/51
Local ticket: T-01. See `docs/features/member-cv-portal/spec.md`, revision 1.

## Acceptance criteria

- [ ] Verify signed Google ID token audience/expiry/issuer, hosted domain and verified email on server. Self-onboard without members allowlist.
- [ ] Stable user ownership enforced; never grant admin access.
- [ ] Durable private draft, stale-revision conflict, publish snapshot and withdraw transactions.
- [ ] Publication is server-generated PDF and existing Talent Directory projection only updates on publish.
- [ ] RLS isolates private data; exact current-file access and old file cleanup; no direct forged-client writes.
- [ ] Incremental SQL and setup/rollout docs.

## Blocking dependencies

T-00: https://github.com/Helix-NMBU/helix-webpage/issues/52

## Verification

Injected Google/API lifecycle tests plus integrated PostgreSQL role scenarios.

Workers commit in isolated worktrees. Coordinator integrates, verifies and closes this ticket with evidence. Parent remains open until merge.

Status: ready
