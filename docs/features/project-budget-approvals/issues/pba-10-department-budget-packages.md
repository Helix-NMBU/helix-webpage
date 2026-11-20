# PBA-10: Submit and approve department budget packages

## Parent and requirements

Parent: HELIX-75, `project-budget-approvals`, approved specification revision 2.
Requirements: F-01, F-02, F-03, F-04, F-05, F-12, F-13, F-14, F-15.
Source: scope.md decisions D11 through D15 and the department-submission contract in spec.md.
Tracker target: HELIX / Helix member Platform / existing Finance milestone. One new child; reuse the existing parent and nine published children.

## What to build

Replace individual project handoff/final approval with one department package. Deliver the department lead's readiness/send preview, immutable submission, Finance's grouped change review and one atomic Head of Finance decision. Attribute every project's full budget and related actuals to its responsible budget department.

## Acceptance criteria

- [ ] The department view lists every associated project, including No budget, Draft, submitted candidates and approved baselines. It identifies who needs follow-up, the selected responsible budget department, readiness and last approved/proposed amounts. Projects with no selected owner remain explicitly unallocated rather than borrowing a caller-dependent fallback.
- [ ] A current department lead previews and sends the whole allocated department budget. All included ready submitted candidate versions receive the department decision and enter Sent to approval (Finance). Unchanged projects use their approved baselines. Unfinished projects remain visible, do not block submission and do not add unsubmitted amounts.
- [ ] The complete project budget belongs to its one responsible department, including other departments' systems. Other associated departments do not count it again. Preserve physical system identity, project-owned unbudgeted costs, removed-entry actuals and explicitly unmapped legacy subtotals in the canonical Finance and minimal Season aggregate readers.
- [ ] The submission pins exact candidate contents and approved baselines, ownership, season, readiness rows and project/department totals. It preserves actor/date/history and cannot silently change when another view refreshes. Exclude unsubmitted Draft entries from Finance's snapshot.
- [ ] Finance sees projects grouped with their entries and subtotals plus the department total. New, Changed and Removed labels, old/new values and net changes are clear. Removed rows remain visible, and unchanged approved projects remain part of the whole department context.
- [ ] Only explicit Head of Finance approves the package. All included candidates promote in one transaction or none. Current department and Finance authority, stable-entry/P0 guards, complete-union earmark compatibility and stale-plan checks are enforced server-side. Old individual final-approval actions cannot bypass the package.
- [ ] Actual costs, completion, voids and evidence may refresh during review without invalidating an unchanged submitted plan merely because they bumped a header/global revision. Purchases keep their recorded approved version and continue against the previous approval until package promotion.
- [ ] Returning, withdrawing or resetting an included candidate invalidates the whole active package with a reason and returns included candidates to Draft for both reviews again. Previous approved baselines stay usable. Retain the old package and its decisions; no partial approval or silent member removal.
- [ ] Existing unpacketized Finance-pending candidates require a genuine department lead preview/send into a new package using their exact versions. Preserve prior department decisions; never fabricate package authorship, dates or approval.
- [ ] Retries, concurrent decisions, candidate changes, ownership changes and revocation fail safely without duplicate decisions, promotion or notifications. Use shared notifications and durable outbox events, strict scoped DTOs, existing shadcn/Radix behavior and dedicated loopback fixtures.

## Blocked by

PBA-08 / HELIX-83. Its canonical facts, historical funding/evidence and shared local projections must be integrated and verified first. PBA-09 additionally becomes blocked by this ticket.

## Shared contracts and change areas

Reserve additive migration 074 after actual 073; do not change previously applied migrations. Reuse api/finance.ts and its module dispatch. Publish shared department-package request/response/decision contracts before UI consumption. Coordinate finance-project-budgets, the promotion core, effective department hierarchy, local repositories, project/department/Finance entry points, comparisons, scope discovery, mail/outbox, exports and Season allowlists. Keep one authoritative allocation calculation across server and local views.

Pin candidate IDs/content hashes and baseline pointers with a package revision. Existing header revisions change on purchases, completion and obligations and must not serve as packet plan fingerprints. Lock all sorted involved headers and stable entries before the legacy ledger; validate the complete replacement union before materialization. Do not loop public single-project promotions with late anchor/header acquisition or accept a client-controlled internal bypass.

## Verification

- API/real PostgreSQL: two-project all-or-none approval, duplicate/revoked/stale decisions, direct-project bypass denial, packet return/withdrawal, ownership changes, both purchase/promotion orders and concurrent optional requests. Show no partial totals while the transaction waits.
- Read models: complete responsible-department allocation across different physical systems, no duplicate project/actual, unstarted multi-department ownership, unchanged approved baselines, unfinished candidates, unmapped legacy subtotal and minimal Season privacy.
- UI/browser: department readiness/send preview and Finance grouped comparison with New/Changed/Removed, old/new values, project totals and department total. Verify current roles, missing/Draft projects allowed, dirty forms, keyboard/focus/dismissal and supported narrow width. Retain screenshots outside the repository.
- Regression: existing purchases, invoice/provider/recovery, historic approvals, P0 obligations, funding links and migration mapping remain intact. Real PostgreSQL CI must load 074 and execute the new cases.

## Status

Approved on 20 November 2026 with "Approve, publish and continue delivery". Published as [HELIX-85](https://linear.app/helixnmbu/issue/HELIX-85/pba-10-submit-and-approve-department-budget-packages). Implementation is blocked by verified PBA-08.
