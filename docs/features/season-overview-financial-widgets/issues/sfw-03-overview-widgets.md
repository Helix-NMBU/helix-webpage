# SFW-03: Show understandable financial widgets on Season Overview

Parent: Season overview financial widgets specification, revision 1. Requirements: F-01 through F-06.

## What to build

Add an accessible, responsive financial section to the existing Season Overview using the authorized summary and manual bank snapshot.

## Acceptance criteria

- [ ] Show season planned expense budget, recorded actual and dated combined bank snapshot with clear definitions and budget status. Explain that actual includes recorded unpaid invoices and is not cash paid. Do not call the snapshot live or verified.
- [ ] Show all departments' spent versus budget, with expandable system details, exact NOK text and visible over-budget/unbudgeted values. Support keyboard access and narrow layouts.
- [ ] Display absent, inaccessible draft, zero, unavailable and stale states accurately. On season mismatch identify it and do not combine values. Recoverable failures use shared notifications, with retry, and do not block existing progress/milestones.
- [ ] Update after source changes; link to Financials only where authorized. Preserve existing project overview and privacy boundaries.

## Blocked by

SFW-01 and SFW-02, which provide the production read contracts and snapshot workflow.

## Change areas and verification

Recheck ProjectManagement, existing overview cards and access/session patterns. Test summary behavior and independent loading/failure, draft permissions, zero, stale and mismatch, expansion and link visibility. Verify desktop and mobile locally, including keyboard and finance update refresh. Run focused and integrated checks in the parent spec; record review and configured-service prerequisites before a PR is ready.
