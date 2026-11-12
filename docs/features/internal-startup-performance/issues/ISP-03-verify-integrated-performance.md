# ISP-03 · Verify the integrated changes and record timings

Parent is the [Internal performance specification](../spec.md). Covers F-01 to F-06. Blocked by ISP-01 and ISP-02.

## Acceptance

- [x] The integrated build reduces compressed JavaScript required to reach cold Internal Home. Record the base and candidate commits, build and browser settings, cold and warm observations, and the number of sidebar sponsor-data requests before and after.
- [x] Verify permission scenarios, page data loading, access refresh and recovery, and the host, route, and login smoke tests on the integrated branch.
- [x] With an authorized signed-in session, record session lookup, token retrieval, member verification, and the requests that follow. If unavailable, identify the missing evidence and report local fixture measurements separately.
- [x] Record the integrated test, lint, typecheck, build, and deployment guard results for review.

## Change areas and verification

Use the two integrated changes, a clean baseline build, and a browser network trace. Record evidence in the feature delivery record. Follow the verification commands in the specification. Authentication changes are a separate decision based on the trace.


## Integrated verification

Verified `924f264`. The [delivery record](../delivery.md) has the base and candidate measurements, browser results, checks, and the limit on signed-in production timings.
