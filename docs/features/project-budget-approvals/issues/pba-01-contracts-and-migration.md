# PBA-01: Establish project budget contracts and safe migration groundwork

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-01, F-04, F-13, F-15.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Establish the shared project-budget/version, scoped access, stable entry, purchase-version, obligation and evidence-transfer contracts required by the vertical slices. Add additive schema and compatible effective-entry reads without switching the old workflow prematurely. Provide a dry-run mapping seam and a safe local test bootstrap.

## Acceptance criteria

- [ ] Publish the request/response and schema ownership contract consumed by later tickets: project/season header, responsible department, approved/pending version pointers, stable entry IDs, immutable submitted contents, expected revisions and durable request IDs.
- [ ] Resolve author permissions from current project lead assignments and department review/registration from current season department leads. Keep Financials and Head of Finance capabilities separate. Deny generic/partner sessions and cross-project reads without leaking private data.
- [ ] Add version/decision, completion, obligation and evidence metadata through new migrations. Preserve current budget item IDs, actual allocations, request commitments and document IDs. Existing consumers still receive compatible effective legacy facts until an approved project replacement exists.
- [ ] Produce a dry-run mapping report with real source IDs, proposed same-season target projects/departments, totals and conflicts. Do not invent project assignments or fabricate approval events; the implementation accepts an operator-supplied mapping.
- [ ] Update loopback fixtures and database bootstrap to include feature migrations and real identity/project/department relations. Update PostgreSQL CI wiring so feature race tests will run rather than silently skip.
- [ ] Recheck remote main and current migration numbering before editing. Keep all new operations behind existing API entrypoints. Verify the clean source route budget stays at most 11; do not import unrelated wrappers from the dirty checkout.

## Blocked by

None. Eligible when Deliver is requested.

## Shared contracts and change areas

src/features/Finance/types.ts and access.ts; api/_lib/finance-types.ts, finance-access.ts, finance-service.ts and finance-handler.ts; new db/migrations files; existing project/department authorization queries; local finance repositories/fixtures; PostgreSQL test setup and CI. The coordinator owns central router/type registration and reserves migration numbers. New domain modules may be added, but avoid concurrent rewrites of shared services.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- Exercise scoped access through the service/API seam with assigned and unassigned leads, other departments, ordinary Financials, Head of Finance, revocation and partner identities.
- Apply the actual additive migrations to an isolated local database containing legacy plans, requests, allocations, imported history and private evidence; compare identifiers and effective totals before/after.
- Test dry-run mapping writes nothing and reports unresolved/conflicting IDs. Confirm the new migration files are loaded by the test harness and source function guard passes on the chosen clean base.

Specification cases: V-01, V-08.

## Status

Approved, published in Linear. First eligible work once approved and Deliver is requested. Record real verification and review evidence before closure.

