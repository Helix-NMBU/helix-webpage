# ISP-02 · Defer feature code until the app or route needs it

Parent is the [Internal performance specification](../spec.md). Covers F-04 and F-05. No blockers.

## Acceptance

- [x] Cold Internal Home and login avoid JavaScript for the public marketing pages, partner portal, and CV editor. Opening a deferred feature loads its code.
- [x] A like-for-like production build comparison shows a reduction in total compressed JavaScript needed to reach Internal Home, including imported and preloaded chunks.
- [x] Internal sign-in and Google callback handling, direct CV links, legacy redirects, the public entry, and partner OTP entry retain their behavior. Lazy navigation uses the existing loading UI.

## Change areas and verification

Start with `App.tsx`, `MemberPlatform.tsx`, and transitive imports. Preserve the host resolver, callback claim behavior, and session contract. Coordinate shared member-platform test edits with ISP-01.

Inspect the build manifest and compare the cold-load JavaScript needed by each build. Run the host, session, and member-platform suites. Smoke-test host routing, legacy redirects, deferred features, and both login entry points in a browser. Record configured authentication checks separately from loopback fixture checks.


## Integrated verification

Integrated as `924f264` from worker commit `e1c000f`. The production build comparison loaded 421,704 vs. 289,951 gzip bytes on cold Internal Home. Chrome verified deferred features, login and callback paths, and chunk-load recovery. All 138 focused tests passed on the integration branch.

Independent review caught a blank page on a failed CV import. At `cb16b32`, both CV routes showed a shared notification and recovered on reload in Chrome. The three independent reviewers confirmed the repair.
