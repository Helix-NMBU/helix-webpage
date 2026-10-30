# SFW-02: Maintain a dated combined bank balance

Parent: Season overview financial widgets specification, revision 1. Requirements: F-03, F-04, F-05.

## What to build

Allow Finance to maintain a dated manual snapshot of the combined balance of Helix bank accounts and expose only that snapshot to authorized Season Overview readers.

## Acceptance criteria

- [ ] Finance-authorized users can enter and update a NOK amount and as-of date through Financials; unauthorized users cannot write even with a valid session or Season Overview access. Use an existing Finance-level capability, not a position name or generic login.
- [ ] Persist a single latest snapshot with actor and update time in Neon; validate amount/date, avoid lost updates, and return clear conflict recovery. Missing snapshot differs from a zero balance.
- [ ] Season Overview readers can read only the balance, its as-of date and appropriate snapshot metadata. Label it manually entered; never calculate it from budget/funding, or imply live verification.
- [ ] Failed saves retain input and provide shared error notification and recovery; successful updates notify and refresh the snapshot. Local test data stays in loopback development mode.

## Blocked by

None. Coordinate shared API dispatch, types and migrations with SFW-01. SFW-03 consumes this read contract.

## Change areas and verification

Recheck Finance capabilities, finance routes, database migration conventions, finance forms, notifications and local adapters. Reuse existing entrypoints and exact-money handling. Test authorized/denied reads and writes, validation, dates, persistence, zero, concurrent changes, failure retention and refresh. Browser-check the editor and keyboard flow. Run relevant tests and typechecks.
