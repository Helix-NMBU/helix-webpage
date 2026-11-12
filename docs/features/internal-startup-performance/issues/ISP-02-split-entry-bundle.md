# ISP-02 · Defer feature code until the app or route needs it

Parent is the [Internal performance specification](../spec.md). Covers F-04 and F-05. No blockers.

## Acceptance

- [ ] Cold Internal Home and login avoid JavaScript for the public marketing pages, partner portal, and CV editor. Opening a deferred feature loads its code.
- [ ] A like-for-like production build comparison shows a reduction in total compressed JavaScript needed to reach Internal Home, including imported and preloaded chunks.
- [ ] Internal sign-in and Google callback handling, direct CV links, legacy redirects, the public entry, and partner OTP entry retain their behavior. Lazy navigation uses the existing loading UI.

## Change areas and verification

Start with `App.tsx`, `MemberPlatform.tsx`, and transitive imports. Preserve the host resolver, callback claim behavior, and session contract. Coordinate shared member-platform test edits with ISP-01.

Inspect the build manifest and compare the cold-load JavaScript needed by each build. Run the host, session, and member-platform suites. Smoke-test host routing, legacy redirects, deferred features, and both login entry points in a browser. Record configured authentication checks separately from loopback fixture checks.
