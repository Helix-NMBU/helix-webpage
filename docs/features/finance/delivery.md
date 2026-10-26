# Finance access and contracts

## Scope

This slice adds the member finance entry point, the access contract, and the private schema later finance work builds on. It does not register purchases, approve budgets, import items, or send email.

- One server function, `api/finance.ts`, re-exports a handler from `api/_lib`. Injected services keep the handler testable.
- The shared contract, money helpers, and capability rules live in `src/features/Finance`. The API re-exports them. The browser does not import `/api` modules, because the local API gate handles every `/api` path.
- Public pages are Overview, Purchases, and Budgets. Financing is a separate page.
- Legacy `/teams/finance`, `/teams/finance/budget`, and `/teams/finance/expenses` links redirect to those pages and keep the query and hash.
- Department team navigation is unchanged. `team.finance` is not a finance permission.

## Capability matrix

A verified active member can open the public pages, see public earmarks, register an actual later, and see their own requests. Those flags do not require a finance profile.

| Profile | Adds |
| --- | --- |
| business | Financing, funding, and earmark management |
| finance | Business access, plus the purchase register, files, refunds, payments, void, review, draft budget items, and permitted imports |
| head_of_finance | Finance access, plus creating and approving a budget, protected budget edits, and request decisions |

Active profiles are a union. The server reads them only from `finance.member_grants`. Title, department, `team.finance`, the platform administrator wildcard, and recruiting grants do not add a profile.

Ordinary members receive public budget fields and public earmark purpose and amount. Notes, funding sources, earmark conditions, and refund account or phone values stay out of that response. A draft budget's items are omitted unless the draft-items capability is true. The purchase register is present only when the purchase-register capability is true. Refund account and phone values are present only when the files-and-refunds capability is true, and only for the current season.

## Operator path

Grants are not edited in the product UI and a member cannot grant themselves.

- `finance.set_member_grant(operator, member, profile, active, reason)` grants or revokes one profile and writes an audit row. The operator must be an active platform administrator in `identity.member_roles`. A member still cannot grant or revoke their own profile.
- `scripts/finance-grants.mjs` parses the same request. Without `--apply` it prints a dry run, states the administrator requirement, and does not connect. `--apply` calls the function with `DATABASE_URL`. The database check still rejects an operator who is not an active platform administrator.
- `finance.configure_current_season`, `finance.configure_approval_threshold`, and `finance.configure_annual_reference_start` are the same kind of operator path.
- The annual reference function stores the next unused value. It does not create a purchase and it does not return a formatted production reference. A later value cannot move backward or reuse an issued number.
- The approval threshold is a positive integer number of ore. A later registration compares an amount as strictly greater than that stored value, with no tolerance.

## Schema and function budget

Migration `db/migrations/011_finance_core.sql` creates the private `finance` schema. It is additive. Earlier migrations are not renumbered. Row level security is enabled on every finance table. Browser roles receive no privileges. The API connects as the table owner, so owner queries bypass row level security; the policies still deny a non-owner role by default. Audit rows are append-only.

The migration inserts one `view_versions` row at version 0. It does not seed grants, seasons, budgets, funding, purchases, or other business rows. `finance.member_grants.member_id` uses `ON DELETE RESTRICT`. Audit history rejects update, delete, and truncate. Reference counters accept `request:SNN` as its own key, separate from `purchase:YYYY`. An earmarked budget item must use a funding part from the same season.

`api/finance.ts` is function 11 of the 11-function source and generated budget. No finance bucket variable is added in this slice.

## Requests

Reads use `GET /api/finance?action=` with `capabilities`, `version`, `overview`, `budgets`, `purchases`, or `financing`. A matching `knownVersion` returns `{ unchanged: true, viewVersion }` and no page payload. Financing checks the capability before that short-circuit.

Mutations use one JSON object with `action`, a UUID `requestId`, and `expectedRevision` when the action edits an existing record. This slice checks the caller, the action, and those fields, then returns "not available yet" without writing. Later slices perform the writes.

Responses send `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

## Client

The member shell loads a finance capability response for the signed-in member. Window focus loads that response again. A denied response clears cached finance pages. Switching accounts remounts the provider and drops the previous response, including a response that arrives late. A financing, purchase, or budget response that lands after a focus recheck is kept only when the current capabilities still allow it. Refund fields are removed when the files-and-refunds capability is gone, and draft budget items are removed when the draft-items capability is gone. Capability flags and the view version are read in one statement, so a revoke cannot pair older flags with a newer version.

The local member development mode stays on loopback and does not call the finance API. That fixture has no finance profile, so Financing stays hidden.

## Still operator input

- Map each system to an existing department key.
- Choose the current season.
- Grant business, finance, and head profiles explicitly.
- Set the approval threshold and the unused annual reference start before any production reference is issued.
- Object storage, file delivery, and email remain later work.
