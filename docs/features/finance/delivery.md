# Finance delivery record

## Current integration status, 27 October 2026

The approved specification is [HELIX-34](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing), revision 1. The local integration branch is `feat/finance`, based on `main` at `f755d3105a4eec76c2ae54db1040a557e11fc26e`. PR #113 is merged locally at `b844ad2`; it has not been merged on GitHub. The work remains local, with no deployment or production database changes.

FIN-04 was integrated at `437885e4`, with spending warnings at `b01913f`. Finance access, processing, notification, recovery and request-form fixes are integrated in subsequent commits. Partial approvals, candidate-file recovery, snapshot consistency and access-review fixes are integrated. Independent standards and specification review identified issues that were corrected and rechecked. Configured-service acceptance and generated-function verification remain open as detailed in `verification.md`. Ticket closure and release evidence must follow verified acceptance, not this interim record.

An isolated PostgreSQL instance on loopback is used with synthetic data for multi-connection tests. The opt-in test creates and drops a randomly named test database; it rejects non-loopback endpoints. The earlier validation figures below describe older slices and are historical.

## Historical access and contracts record

The access description below reflects the original slice. The current rule requires the Financials role for all finance pages and APIs; Finance department membership alone does not grant it.

## Scope

This area adds the member finance entry point, the access contract, and season budgets. It does not register purchases, import items, manage funding, or send email.

- One server function, `api/finance.ts`, re-exports a handler from `api/_lib`. Injected services keep the handler testable.
- The shared contract, money helpers, and capability rules live in `src/features/Finance`. The API re-exports them. The browser does not import `/api` modules, because the local API gate handles every `/api` path.
- Public pages are Overview, Purchases, and Budgets. Financing is a separate page.
- Legacy `/teams/finance`, `/teams/finance/budget`, and `/teams/finance/expenses` links redirect to those pages and keep the query and hash.
- Department team navigation is unchanged. `team.finance` is not a finance permission.

## Capability matrix

The original access slice allowed every verified member to open the public pages and register purchases. This was superseded by the Financials role requirement above.

| Profile | Adds |
| --- | --- |
| business | Financing, funding, and earmark management |
| finance | Business access, plus the purchase register, files, refunds, payments, void, review, draft budget items, and permitted imports |
| head_of_finance | Finance access, plus creating and approving a budget, protected budget edits, and request decisions |

Active profiles are a union of explicit `finance.member_grants` and the Financials role assigned in Member access. Financials adds the finance profile; it does not add head-of-finance privileges. The Finance department and Financials access are independent. Title, department, `team.finance`, the platform administrator wildcard, and recruiting grants do not add a profile.

Ordinary members receive public budget fields. An earmark's purpose and amount are included only when its funding is secured or received. A profile with financing still receives the purpose and amount for every linked part. Notes, funding sources, earmark conditions, and refund account or phone values stay out of the ordinary member response. A draft budget's items are omitted unless the draft-items capability is true. The purchase register is present only when the purchase-register capability is true. Refund account and phone values are present only when the files-and-refunds capability is true, and only for the current season.

## Operator path

Financials is assigned by a platform administrator in Member access; members cannot change their own assignment. Other explicit profiles use the operator path below.

- `finance.set_member_grant(operator, member, profile, active, reason)` grants or revokes one profile and writes an audit row. The trusted operator must verify the administrator identity and account status; the database function checks the administrator role in `identity.member_roles` but does not independently verify account status. A member still cannot grant or revoke their own profile.
- `scripts/finance-grants.mjs` parses the same request. Without `--apply` it prints a dry run, states the administrator requirement, and does not connect. `--apply` calls the function with `DATABASE_URL`. The database check rejects an operator without the administrator role; it does not independently verify account status.
- `finance.configure_current_season`, `finance.configure_approval_threshold`, and `finance.configure_annual_reference_start` are the same kind of operator path.
- The annual reference function stores the next unused value. It does not create a purchase and it does not return a formatted production reference. A later value cannot move backward or reuse an issued number.
- The approval threshold is a positive integer number of ore. A later registration compares an amount as strictly greater than that stored value, with no tolerance.

## Schema and function budget

Migration `db/migrations/011_finance_core.sql` creates the private `finance` schema. `db/migrations/012_finance_season_budgets.sql` adds season-budget maintenance: an optional owner email, a category check, one protected unallocated item per system, and the budget mutation functions. `db/migrations/015_finance_requests.sql` adds purchase-request drafting, submission, Head decisions, commitments, and notification outbox events. All are additive. Earlier migrations are not renumbered. Row level security is enabled on every finance table and is not forced. Browser roles receive no privileges. The API connects as the table owner, so owner queries bypass row level security; the policies still deny a non-owner role by default. Audit rows are append-only.

The migration inserts one `view_versions` row at version 0. It does not seed grants, seasons, budgets, funding, purchases, or other business rows. `finance.member_grants.member_id` uses `ON DELETE RESTRICT`. Audit history rejects update, delete, and truncate. Reference counters accept `request:SNN` as its own key, separate from `purchase:YYYY`. An earmarked budget item must use a funding part from the same season.

`api/finance.ts` is function 11 of the 11-function source and generated budget. No finance bucket variable is added in this slice.

## Requests

Reads use `GET /api/finance?action=` with `capabilities`, `version`, `overview`, `budgets`, `purchases`, or `financing`. A matching `knownVersion` returns `{ unchanged: true, viewVersion }` and no page payload. Financing checks the capability before that short-circuit.

Mutations use one JSON object with `action`, a UUID `requestId`, and `expectedRevision` when the action edits an existing record. Season-budget actions create one budget for the configured current season, approve that draft once, and add, edit, cancel, restore, or ensure the unallocated item. Request actions save, submit, withdraw, cancel, revise, decide, and close purchase requests. Each successful change bumps `finance.view_versions` in the same database function. Repeating the same request id returns the saved result. A different payload for that request id is rejected. Purchase, import, and other later-slice mutations still return "not available yet" without writing.

Responses send `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Client

The member shell loads a finance capability response for the signed-in member. Window focus loads that response again. A denied response clears cached finance pages. Switching accounts remounts the provider and drops the previous response, including a response that arrives late. A financing, purchase, or budget response that lands after a focus recheck is kept only when the current capabilities still allow it. Refund fields are removed when the files-and-refunds capability is gone, and draft budget items are removed when the draft-items capability is gone. Capability flags and the view version are read in one statement, so a revoke cannot pair older flags with a newer version.

The budgets page shows department, system, and item plan, actual, and difference. Cancelled rows stay hidden until the member asks to see them. Unallocated items stay out of the item table; their spending is shown as unbudgeted, with the item reference available for a later purchase or request. Draft items, notes, and owner email stay off the member view. Funding source names and earmark conditions stay on the financing capability. The Head of Finance can create and approve the budget. Finance can maintain items. A protected change after approval asks for a reason. A failed or stale save leaves the form values in place and reports the error through the shared notification.

The local member development mode stays on loopback and does not call the finance API. That fixture has no finance profile, so Financing stays hidden and budget changes stay unavailable.

## Still operator input

- Map each system to an existing department key.
- Choose the current season.
- Assign Financials in Member access for the finance profile; grant business and head profiles explicitly through the operator path.
- Set the approval threshold and the unused annual reference start before any production reference is issued.
- Purchase files use the private finance bucket. Notification mail, purchase export, and upload cleanup are documented in `docs/features/finance/notifications-exports.md`.
