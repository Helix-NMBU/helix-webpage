# SFW-01: Provide the authorized season financial summary

Parent: Season overview financial widgets specification, revision 1. Requirements: F-01, F-02, F-05.

## What to build

Expose a minimal, server-authorized read model for Season Overview using canonical finance calculations, independently of the Financials space grant. Do not return private finance payloads.

## Acceptance criteria

- [ ] A Season Overview-only member gets approved season totals and department/system plan and actual aggregates; users lacking Season Overview access and unauthenticated or revoked users are denied. Financials access is not granted by this read.
- [ ] Draft amounts are returned only with the existing draft-budget capability. Distinguish draft-inaccessible, absent, and genuine zero states.
- [ ] Preserve existing actual and plan semantics, unbudgeted and cancelled-item actual, meaningful inactive systems and exact arithmetic. Include season identity to detect mismatches.
- [ ] Response excludes purchase, attachment, refund, private funding and scenario details. Failures do not require the project overview to fail.

## Blocked by

None. Coordinate shared API dispatch and contracts with SFW-02.

## Change areas and verification

Recheck `api/_lib/finance-summary.ts`, finance access/service, project workspace API, types, and local adapters. Reuse existing routes to preserve the function cap. Test authorized/unauthorized/draft cases and actual arithmetic through server and existing integration seams. Check data isolation and mismatched season metadata. Run relevant tests and API typechecks.
