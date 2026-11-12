# ISP-01 · Build the sidebar from member-access flags

Parent is the [Internal performance specification](../spec.md). Covers F-01, F-02, and F-03. No blockers.

## Acceptance

- [ ] The existing authenticated self endpoint returns Pipeline, agreements, and review permission booleans alongside the existing fields. Members with no sponsor access, agreements-only access, Pipeline access, or review access get the same grants as the respective server routes. Finance access still controls the sidebar placement of the review link.
- [ ] Internal Home and unrelated route transitions make no sponsor-data requests for link visibility. Opening a sponsor page requests its records and uses the server's existing authorization checks.
- [ ] Initial load, tab focus, and access-change events refresh permissions. Concurrent refreshes coalesce. Revocation, retry after failure, and account changes produce the right links. Local fixtures follow their configured permissions.

## Change areas and verification

Use the existing member-access service and handler, `MemberFeatureAccess`, `app-sidebar`, and local access helpers. Keep the SQL grant checks aligned with the partner-deals service. Coordinate with ISP-02 if both touch member-platform tests.

Extend the existing member-access service and member-platform tests to cover permission parity, a request-count regression, revalidation, and unavailable or stale responses. Check direct allowed and denied sponsor routes using existing authorization tests and a local browser.
