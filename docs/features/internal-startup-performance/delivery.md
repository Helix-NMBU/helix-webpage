# Internal startup and navigation performance delivery

Approved [specification](spec.md) revision 1. Repository is `Helix-NMBU/helix-webpage`. Parent [HELIX-71](https://linear.app/helixnmbu/issue/HELIX-71/reduce-internal-startup-and-navigation-load) is open in Linear.

GitHub's default branch is `main`. The captured base is `3cf4a25cb2a1a43199e3e54d4fa98d4626a56dd4`. Integration is on `codex/internal-startup-performance` in `/private/tmp/helix-internal-startup-performance`, starting from scope commit `05b5bc3`. The original checkout has unrelated local changes. A separate worktree holds this delivery.

| Ticket | State | Assignment |
| --- | --- | --- |
| HELIX-72 / ISP-01 | Done in Linear | `/root/sidebar`, `codex/internal-startup-isp-01`, `/private/tmp/helix-isp-01`, base `05b5bc3`, worker `ef81137`, integrated `ade4dee` |
| HELIX-73 / ISP-02 | Done in Linear | `/root/bundle`, `codex/internal-startup-isp-02`, `/private/tmp/helix-isp-02`, base `05b5bc3`, worker `e1c000f`, integrated `924f264` |
| HELIX-74 / ISP-03 | Done in Linear | Coordinator on the integration worktree, with both implementation tickets integrated. Verification applies to `924f264`. |

Both implementation commits are integrated and verified. Independent review and PR are pending.

## Baseline

The build from `3cf4a25` used Node 24.19.0, npm 11.17.0, the locked dependencies, and `VITE_NEON_AUTH_URL=/api/auth`. Vite emitted `index-B2XvVI1v.js`, which matches the deployed entry sampled during Scope. The browser harness maps Helix hosts to a temporary loopback server, gzips static assets, and supplies synthetic session and API responses. Its fresh Chrome context loaded 421,704 gzip bytes of JavaScript to reach Home. A reload transferred zero JavaScript bytes from the server. Home started 11 API requests, including the three sidebar sponsor-data reads. Notifications → Home started six more sidebar sponsor-data reads. The separate review-notifications request remains part of notification behavior.

The baseline client typecheck passed. No signed-in production tab was available in the connected browser. Loopback timings describe the fixture run and do not establish real Neon or member-verification latency.


## Sidebar integration

At `ade4dee`, 95 focused tests across eight suites passed. Migrated database tests checked grant parity with the protected sponsor endpoints. Provider and platform tests covered request counts, coalescing, revocation, retries, stale responses, and account switches. In loopback Chrome, Pipeline and Partner agreements appeared for the allowed member. Switching the fixture to agreements-only removed Pipeline, denied a direct Pipeline visit, and kept agreements accessible.


## Bundle integration

At `924f264`, 138 focused tests across six suites passed. A like-for-like production build comparison in Chrome measured 421,704 gzip bytes on the base and 289,951 on the integrated branch, a 31.2% reduction. Warm reload transferred zero JavaScript bytes in both builds. The public app, partner portal, and CV editor were absent from Internal Home and login resources. Chrome checked Home and login, direct and legacy CV callbacks, the public site, the partner OTP request, and chunk-load error notification and recovery. These browser scenarios used synthetic service responses. The legacy CV redirect retained the verifier query in both builds, with one exchange in each. The direct callback removed it.


## Integrated verification at 924f264

| Measurement | Base | Integrated |
| --- | ---: | ---: |
| Cold Home JavaScript, gzip body bytes across distinct resources | 421,704 | 289,951 |
| Warm Home reload, JavaScript transfer bytes | 0 | 0 |
| Startup API requests | 11 | 8 |
| Sidebar sponsor-data reads on Home | 3 | 0 |
| Sidebar sponsor-data reads across Notifications → Home | 6 | 0 |

Build both commits with the same lockfile and `VITE_NEON_AUTH_URL=/api/auth`. Use a new Chrome context per cold run and reload it for the warm run. Serve the builds and identical API fixtures on loopback, with gzip for JavaScript and immutable caching for hashed assets. Map the Internal, public, and partner hostnames to the local server for host routing. Count distinct JavaScript resource bodies through Home render. Count only `pipeline`, `shared`, and `financeReviews` in the sidebar metric. Local browser harnesses and logs are under `/private/tmp/helix-isp-coordinator`.

In one matched production-build fixture run, the Home heading appeared at 139 ms on the base and 107 ms on the integrated build. Warm results were 37 ms and 38 ms. This sample includes simulated authentication and says nothing about live sign-in latency. No authorized signed-in production session was available, so real session lookup, token retrieval, and member-verification timings remain unmeasured.

The candidate browser checks confirmed all three page reads, direct Pipeline denial, access revocation, and notification retry. Dedicated Vite member mode confirmed the agreements-only fixture and denied direct Pipeline access. The host checks confirmed one verifier exchange on direct and legacy CV callbacks and verified the public page, partner OTP request, and recovery after a failed entry chunk.

`npm test` passed with 1,808 tests, 8 skipped, and 3 deployment guard tests. `npm run lint`, `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`, and `npm run build` passed. The build produced 9,999,704 static bytes within the 10 MB guard and counted 11 source functions.
