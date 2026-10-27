# Finance

Status: ready-for-prepare
Updated: 26 October 2026
Feature: `helix-finance-migration`
Destination: `Helix-NMBU/helix-webpage`, `internal.helixnmbu.no`
Linear project: [Helix member Platform](https://linear.app/helixnmbu/project/helix-member-platform-d4f6b360b4c0), `P-HELIX-4`
Existing milestone: Financial Budgets, `eb62b788-596a-4920-ab8d-cfda9aa53cc0`
Milestone name: **Finance**, published after approval of specification revision 1

## Purpose and authority

Replace the finance sample pages with a working finance module inside the member platform. Preserve the implemented budget, purchase, payment-tracking and funding workflows described in the supplied source inventory. Add purchase requests, prior approval and partial fulfillment, which the old application documents but does not implement.

This is scoping work. It does not authorize application implementation, database changes, data imports, email sending, a push or deployment. No implementation tickets have been published. The previous repository must stay untouched.

## Evidence and precedence

1. The user's decisions recorded below and current `AGENTS.md` govern destination behavior.
2. [source-inventory.md](source-inventory.md) is an exact copy of the supplied 26 October 2026 functional inventory. It describes `oskarrandel/helix-finance` at commit `6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9`.
3. This scope reconciles that inventory with the destination repository and Linear read on 26 October 2026. It does not independently certify the source implementation or live source data. The source's reported 430 tests were not rerun in this session.

Inventory SHA-256: `db023b45a104ec667dc863971d1bb53f70286de2f483bd8fa60e62bb1258d1e6`.

The inventory's source exclusions for procurement approval and commitments are superseded by the user's decisions here. Its proposed production-data migration is excluded. Other documented-only features do not become requirements simply because the source has reserved fields for them.

## Confirmed decisions

| ID | User decision |
| --- | --- |
| D1 | Include purchase requests and approvals in this milestone alongside the implemented source workflows. |
| D2 | Start fresh. Allow department budget CSV import; do not import old purchases, attachments, financing, audits or historical seasons. |
| D3 | Preserve the supplied capability matrix, implemented as explicit platform permissions separate from organizational titles. |
| D4 | Any member can submit and follow a purchase request. Planned purchases strictly above NOK 5,000 including VAT require Head of Finance approval. At or below NOK 5,000, direct registration is allowed. |
| D5 | Always allow a real expense to be recorded after it has occurred. Missing required approval or an amount above approval produces a Finance review flag; the expense still contributes to actual spending. A flag does not confer approval. |
| D6 | An approved request can cover several purchase registrations. Track its remaining commitment and provide an explicit close action. |
| D7 | Each invoice purchase represents one invoice/payment obligation with up to 15 supporting files sharing that payment state. Separate invoices are separate purchases. |
| D8 | Request at least three calendar days before the planned purchase. This is advisory; late requests require a reason and remain submittable. |
| D9 | Approved commitments count in every financing scenario without double-counting the same budget plan. Registrations consume the approval balance; closing releases the unused balance; voiding a linked purchase restores commitment while the request remains open. |

The user explicitly confirmed D1–D9 through the scope interview, including the commitment rule on 26 October 2026. The four-page structure and destination redesign come from the supplied inventory. Renaming the milestone to Finance is a recommendation that reflects this broader scope.

## Current destination behavior

- At initial scope inspection, Linear's Financial Budgets milestone was a 0% placeholder. It has no associated issues in the complete project issue listing read during this session. Its description defers fields, workflows, permissions and delivery criteria to scoping with Oskar.
- `src/features/MemberPlatform/workspace-preview-data.ts` supplies sample Finance Budget and Expenses tables at `/teams/finance/budget` and `/teams/finance/expenses`. `WorkspacePreview.tsx` renders these through the generic member routes. These are not a working finance ledger or approval workflow.
- Member authentication uses the existing server-verified Helix Google Workspace identity through Neon. `api/_lib/helix-workspace.ts` rejects banned, unverified or incorrectly bound identities.
- `api/_lib/member-account.ts` exposes an Admin/Member account role. `helix_role` is a display title. Neither currently establishes the proposed finance capabilities.
- Project management has module-specific grants, an S27 scope and department name arrays. Do not assume it supplies a canonical editable department/system/season catalog or financial approval authority.
- Existing Neon database, auth and private storage adapters are available. `MemberNotifications.tsx` supplies shared session notifications; `website-email.ts` demonstrates server email delivery tracking. These do not yet implement finance integrations.
- `CONTEXT.md` distinguishes organizational positions, access roles and feature access. Preserve that distinction. Older recruitment scope notes contain superseded Supabase and staging references; current code and `AGENTS.md` take precedence.
- There are unrelated local changes. Preserve them. This feature's documentation and the finance glossary additions are the only changes belonging to this scoping work.

## Users and outcomes

Members can inspect spending plans, submit receipts/invoices and ask for approval before a large purchase. They can follow their own requests and fulfill them through several registrations.

Finance can process actual expenses, distinguish unpaid invoices and unreimbursed outlays, review approval exceptions, maintain draft budgets and preserve evidence. The Head of Finance approves requests and season budgets and controls protected changes to an approved budget. Business can maintain expected/secured/received funding and its restricted parts without receiving private purchase or refund data.

All users can distinguish planned money, approved commitments, actual cost, funding and recorded payment state. None of these is presented as a verified bank balance.

## Pages and navigation

| Page | Proposed route | Responsibility |
| --- | --- | --- |
| Overview | `/finance/overview` | Current-season budget state; department/system totals; unbudgeted spending; public earmark usage; permitted financing scenarios; registration/request shortcuts. |
| Purchases | `/finance/purchases` | Registration, own requests and fulfillment; Finance register, unpaid work, approval-exception review; Head of Finance decision queue. Internal tabs/filters may separate these workflows. |
| Budgets | `/finance/budgets` | Public hierarchy; budget creation/approval; authorized item maintenance and department CSV preview/import. |
| Financing | `/finance/financing` | Funding sources, scenarios and earmarked parts for Business and finance only. |

Finance opens Overview. Existing sample finance links redirect to the corresponding real page. Overview drill-down preserves the selected department/system. Use the current season, initially S27; selectable historical seasons are outside the fresh-start release.

The route strings are an implementation proposal. The four page names and their responsibilities are the scoped product structure.

## Permissions and privacy

Apply the source inventory section 5 capability matrix to existing verified members. A grant carries a capability; a job title, department name, Google session, partner OTP, recruiting grant or generic administrator label does not grant finance access on its own.

| Access | Member | Business | Finance | Head of Finance |
| --- | --- | --- | --- | --- |
| Read budget hierarchy and public earmark summaries; register purchases | Yes | Yes | Yes | Yes |
| Submit/follow own requests and register their fulfillment | Yes | Yes | Yes | Yes |
| Read the full purchase register, attachments and private refund fields; mark/undo payment; void with reason | No | No | Yes | Yes |
| Read/manage financing and parts; see funding sources, conditions and scenarios | No | Yes | Yes | Yes |
| Maintain draft items and authorized non-protected approved-item fields; import subject to each change's permissions | No | No | Yes | Yes |
| Create/approve a season budget; protected changes after approval with reason | No | No | No | Yes |
| Approve/reject purchase requests | No | No | No | Yes |

Own-request access is a deliberate addition. It does not grant general purchase history or receipt/refund access. Show the request's decisions, approved/fulfilled/remaining amounts and relevant references without exposing another member's purchase data. Finance needs request context to perform expense review; Business retains only its own-request access unless separately granted finance privileges.

Filter responses on the server, including exports, notifications and file downloads. Do not fetch a full finance payload and hide it in the browser. Check grants on each protected request; clear private cached data after logout, account change, session expiry or revocation. Preserve the platform's stronger suspension checks rather than copying the source's inactive-person fallback.

## Required baseline behavior

The detailed fields, parser rules and examples in source-inventory sections 7–14 and 19 remain the behavioral reference, subject to the explicit changes in this scope.

### Overview and calculations

- Show budget absence/draft/approval, planned cost, registered actual, difference, budget usage and unbudgeted spending at department/system/item levels.
- An unpaid registered invoice counts as actual. Payment and reimbursement markers do not change actual. Voids remove actual; cancelling an item removes its effective plan but retains its historical actual.
- Use NOK including VAT, exact two-decimal arithmetic and Europe/Oslo calendar dates. Quantity is descriptive: quantity 3 with line amount NOK 900 contributes NOK 900.
- Preserve the three source funding eligibility sets: secured/received with P1 plans; add high-confidence applied funding and P2; finally include all applied/prospect funding and P3/P4. Recorded actual contributes to every scenario.
- Unused restricted funding cannot cover unrelated spending. Preserve the source restricted-cover calculation and the separate deadline-aware earmark usage calculation. Do not silently alter deadline handling in scenarios.
- Public earmark summaries include purpose, amount, used, left, deadline and calculated amount to return. Funding source/conditions and scenario details remain restricted.

### Budgets

- One draft or approved budget per season. Head of Finance creates and approves it; approval records actor/date and has no implicit financing-coverage gate.
- Preserve item description, category, planned amount, priority P1–P4/EM, earmark link, reuse state, expected date, owner, lifecycle and note.
- Finance maintains draft items. After approval, protected changes require Head of Finance and a reason. Preserve cancellation/restoration, IDs and purchase links. Zero-plan system unallocated items cannot be maintained as ordinary items.
- Department CSV import previews an authoritative diff with changed values, additions, cancellations, totals, row errors and spending warnings. Commit revalidates and applies all changes or none.
- Preserve matching by system ID plus normalized description; stable matching IDs; omitted optional columns; department isolation; cancellation of absent rows; restoration of reappearing rows; per-change approved-budget permissions.
- An earmarked part may link several non-cancelled items within one system, never several systems. Validate the combined import result.

### Purchase registration and finance work

- Preserve required buyer/supplier/date/justification, team-account/outlay/invoice payment methods, outlay refund details and multiple allocated lines. At least one line and one supporting file are required.
- Preserve explicit outside-budget selection, active-system/item checks, per-item combined over-budget warnings, and separate line descriptions and budget-item labels.
- Support 1–15 JPEG/PNG/HEIC/HEIF/PDF attachments, at most 10 MiB each, through private Neon storage. Validate before normal uploads and recheck stored metadata, ownership and final registration.
- Registration saves purchase, lines, allocations, supporting documents, reference and audit reliably. Preserve NOK line totals, concurrent unique references and the 20 registrations per requester/hour rule, including later voids.
- Finance can browse actual registrations, filter unpaid work, mark/undo reimbursement or invoice payment, and void with a reason. None of these actions transfers money.
- One invoice obligation owns due date, document number and paid/date state. Supporting files share that state. Reimbursement remains separate from an invoice's payment state; the unpaid predicate must consider every applicable unsettled obligation rather than using the first attachment.
- Finance notifications retain purchase/reference/line/warning/document context and exclude refund account/phone values. Saving a purchase succeeds independently of email delivery; delivery failures have durable recovery information.
- Send status/success/warning/error feedback through shared app notifications, with recovery actions when needed. Submission reference and warnings belong in that notification flow. Forms may show actionable field-validation errors; do not add status-only banners or dialogs.

### Financing

- Business and finance maintain funding source/type/amount/status/confidence/owner/dates/agreement link/reporting flag/notes and add/edit earmarked parts.
- Soft-delete and restore funding while retaining parts, budget links, spending and audit. Do not invent a destructive earmark-delete operation.
- Preserve over-earmarking as a warning with exact excess and negative unrestricted remainder; do not silently scale or reject it.
- Funding can exist before a budget. Scenario shortfalls remain advisory.

## New purchase-request workflow

This section is new functionality. Reserved source fields are not evidence of an implemented workflow.

1. A member prepares a request with supplier, purpose/justification, planned purchase date and budget-linked lines/estimated amounts. A request has no receipt requirement before purchase.
2. Submitting makes the request visible to its requester and authorized finance users and notifies the Head of Finance. A planned purchase less than three calendar days away requires a late reason. Validate dates against server-side Oslo today.
3. The Head of Finance approves or rejects with a recorded decision, actor, timestamp, reason and approved line amounts/total. A pending or rejected request creates no approved commitment and is never presented as authorization to buy.
4. The requester can follow the decision and register several actual purchases against the approved request. Each registration retains its own receipt/invoice, reference, actual lines, payment state and audit; request fulfillment is a link, not replacement of those facts.
5. Validate ownership, season, approved revision, line links and cumulative fulfillment on the server. The approval covers the request aggregate; splitting one planned purchase across registrations does not multiply its approved amount.
6. A direct purchase at or below NOK 5,000 may be registered without a request. A purchase above that amount without the required prior approval is still recorded and flagged for Finance review. An overrun against an approved request is judged cumulatively and is also flagged. Actual cost is never truncated to the approved amount.
7. Keep exception review separate from approval and payment. Reviewing an exception must not rewrite the fact that approval was absent or exceeded at purchase time. Preserve the review decision/reason/actor in history.
8. Provide an explicit close action for partially fulfilled requests so unused approval does not remain committed forever. Preserve approved, registered and released amounts and decision history.

The baseline source's warn-and-save policy above NOK 5,000 becomes a real prior-approval policy with an explicit after-the-fact recording path. The source's proposed 10%/NOK 1,000 deviation tolerance is not adopted: the user selected review when actual exceeds approval. Review is not a gate that suppresses an already incurred expense.

### Confirmed commitment rule

For each approved request line while its request remains open:

`remaining commitment = max(0, approved amount - registered linked actual)`.

Several registrations consume the same balance. Closed/cancelled requests have no remaining commitment; actual remains. A voided linked purchase restores commitment while the request remains open. Voiding after closure does not silently reopen the request.

For each item/scenario, `need = actual + max(open approved commitments, scenario-eligible remaining plan)`. Here open approved commitments are summed across that item's open approved request lines. Remaining plan is `max(0, effective plan - actual)` when the item's priority/funding is eligible, otherwise zero. Preserve the existing restricted-funding cover/gap calculation after determining need. This makes approved commitments a floor in every scenario without counting the same plan twice.

Example: approved NOK 10,000, actual NOK 4,000 leaves NOK 6,000 committed. For an eligible NOK 12,000 plan, scenario need is NOK 12,000, not NOK 18,000. For a plan excluded from a scenario, need is at least actual + commitment, NOK 10,000. A cumulative NOK 11,000 actual against NOK 10,000 approval means actual NOK 11,000, commitment zero and an overrun review flag.

## Destination adaptations and safeguards

- Reuse the destination's Neon database, auth and private object storage. Keep Google Workspace member proof separate from partner OTP and feature authorization. Do not add Supabase or import legacy Supabase records.
- Replace Apps Script, Sheets and Drive adapters. Proposed first release has an in-platform register and authorized export/archival capability instead of a continuing purchase-spreadsheet integration. Fresh-start scope requires no legacy attachment migration.
- Retain public purchase references in `YYYY-NNNN` format, with atomic annual sequences and void retention. Before issuing real references, an operator must choose an unused starting point; a fresh database must not accidentally reuse references already issued elsewhere. This can be configured without importing purchase history or touching the source repository.
- Use database transactions, durable submission idempotency, user-bound uploads, recoverable file finalization and cleanup. Do not treat browser-disabled buttons as duplicate prevention.
- Recheck quota, authorization, relations, approval and fulfillment balances under concurrent writes. Reject stale protected edits and stale import previews without losing input.
- Store append-only creation/change/decision audit with actors, before/after values and reasons. Retain voids, cancelled items, soft-deleted funding and supporting evidence.
- Refresh read-only data after external changes; preserve unfinished forms and send an update notification. Successful mutations refresh affected totals, request balances and queues. Do not copy recruitment's session cache in a way that leaves financial balances permanently stale.
- Follow English shadcn/ui/theme conventions, shared notifications and useful-only icons. Keep fixtures/accounts restricted to dedicated loopback development mode.
- Run with untracked `.env`/`.env.local`; no hosted staging workflow. Consolidate finance API operations and upload authorization within the current deployment budget; source and generated output must stay at most 11 functions. Do not create an endpoint for each legacy operation.

## Explicit exclusions

- Historical/source data migration, live Google Sheet/Drive writes, source repo changes and source-system deployment changes.
- General-ledger accounting, VAT/tax accounting, payroll, bank payments/reconciliation, verified cash balance, grant repayment execution and customer invoicing.
- Registered-purchase amount correction, allocation splitting/reallocation, return-to-submitter document repair, supplier-directory management and a general member expense-history view.
- FX services, in-kind sponsorship costing, OCR/AI receipt processing, sponsor CRM/Attio synchronization and engineering/BOM/assets/cost-event systems.
- Predictive financial forecasts, recurring requests, automatic urgent-period exemptions and budget versioning/reopening.
- A platform-wide access-role administration redesign. Provision scoped finance grants through a trusted existing/operator path first; no automatic role grants from job-title strings.

## Acceptance and proposed workstreams

These are preparation boundaries, not published tickets or implementation authorization.

| Workstream | Observable completion |
| --- | --- |
| Finance foundation and access | Existing identity reused; explicit grants; private response/storage boundaries; stable organization/system mappings; season context; exact money, references, transactions and audit. Unauthorized requests return no private data. |
| Budgets and department import | One budget; approval and protected changes; stable-item CSV diff/import; repeated import does not duplicate or erase omitted optional fields; cancelled-item spending remains visible. |
| Financing and scenarios | Funding/parts maintenance, warning/soft-delete/restore behavior, correct restricted coverage and deadline usage; member views contain no sources/conditions/scenarios. |
| Requests and decisions | Member submits/follows own request; late reason required; only Head of Finance approves/rejects; decision history retained; simultaneous decisions cannot overwrite each other. |
| Commitments and partial fulfillment | Several registrations consume one approval; cumulative amount checked atomically; no actual/commitment double counting; explicit closure releases balance; void behavior matches the agreed rule. |
| Actual purchases and private evidence | Valid multi-line submission and private files save once even after a lost response; invalid relationships fail safely; source amount/date/quota examples pass. Missing approval never hides a real cost. |
| Finance work queue | All applicable unpaid obligations shown; payment/undo leaves actual unchanged; void removes actual/unpaid work; exception review retains original approval facts. One invoice's supporting files cannot disagree on payment. |
| Overview and operational delivery | Four pages replace sample routes; correct drill-down/totals; refresh retains input; shared notifications; durable email recovery; authorized archival/export; local browser and real service acceptance. |

Use the applicable `PER`, `PUR`, `PAY`, `BUD`, `FIN` and `SYS` cases in source-inventory section 19, updating the old member-history, approval-warning, multiple-document and cutover expectations to this scope. Do not claim source tests validate destination auth/storage or the new procurement workflow.

Boundary examples: exactly NOK 5,000 versus NOK 5,000.01; quantity 3/line total 900; three registrations cumulatively exceeding one approval; two simultaneous registrations consuming its final balance; a registration saved but its response lost; a late request; a rejected request with an already-incurred cost; closure with unused approval; void before/after closure; a deadline-day earmark purchase; an unpaid invoice marked paid; an approved CSV import becoming stale.

Validate production code through relevant domain/database/API/component tests, all existing typechecks, lint, build/function guards and local desktop/mobile browser inspection. Real configured identity, grant denial/revocation, storage, email and backup/export checks remain release acceptance. Publishing/deployment requires the user's authorization.

## Remaining decisions and preparation details

No blocking scope questions remain. The user confirmed the commitment calculation and closure/void balance behavior. Preparation details below remain to be specified; they are not evidence of completed implementation or blanket approval for governance changes.

Prepare must make the following details concrete without expanding scope: request draft/amend/reject/resubmit/close transitions and who can close; any reapproval flow; line-level approval/fulfillment mapping and mismatch review; presentation of both invoice and outlay obligations; exception-review resolution labels; settings/grant administration; safe export contents/format; upload content checks and cleanup; closed-season write protection; whether approved-item system moves become protected changes. Record any proposed change to baseline governance for user review rather than silently treating it as source parity.

Operational inputs before release: named finance owner and approver grant, approved department/system catalog and import template mapping, unused purchase-reference starting point, funding/budget entry ownership, email recipients, retention/export/recovery process. Do not fabricate people, historical amounts or permissions. No release date or new assignee is inferred from this scope.

## Proposed Linear milestone description

Expand Financial Budgets into Finance for the Helix internal member platform, with Overview, Purchases, Budgets and Financing in the existing English shadcn/ui interface.

Rebuild the implemented helix-finance budget hierarchy, season-budget approval, department CSV preview/re-import, actual purchase registration with private receipts/invoices, unpaid invoice and reimbursement tracking, voiding, financing scenarios and earmarked funding. Preserve financial calculations, references, audit and role-filtered data. The source repository stays untouched.

Add purchase requests and Head of Finance approval for planned purchases strictly above NOK 5,000 including VAT. Members can follow their own requests and register several purchases against an approval, with remaining commitments and explicit closure. The three-day lead time is advisory; late requests need a reason. Always record incurred costs, flagging missing approval or overruns for Finance review. Approval, actual cost and payment remain separate facts. Each invoice purchase has one payment obligation and up to 15 supporting files.

Start fresh, allowing department budget CSV import. Preserve member/Business/Finance/Head of Finance capability boundaries as explicit grants separate from job titles. Use the platform's Neon identity, data and private storage, shared notifications and local validation. Do not import old records, duplicate the old UI, add Supabase, execute bank payments or include engineering/cost-event and registered-purchase correction workflows. Keep source/generated deployment functions at most 11. Publication/deployment needs user authorization.

Approved commitments count in every financing scenario without double-counting the same budget plan. Registrations reduce commitment; closing releases the unused balance; voiding restores commitment while the request remains open.

Acceptance requires correct role/privacy boundaries; budget/import and restricted-funding regression examples; complete request/partial-fulfillment/exception behavior; reliable private uploads and unique idempotent registrations; accurate actual, commitment and unpaid totals; audit/recovery; and local UI plus configured-service validation. Detailed preparation follows the repository scope and preserved source inventory.

## Handoff

Scope is ready for Prepare. This document and the preserved source inventory provide the inputs; the user need not repeat the scope. The user's decisions are recorded above. During the Scope stage, Linear remained unchanged. Prepare subsequently published the approved specification as [HELIX-34](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing) and eleven implementation tickets in the renamed Finance milestone. Scope status does not authorize ticket publication, implementation or release. The normal next step is `$prepare`.


Preparation outcome: [spec.md](spec.md), revision 1, and [tickets.md](tickets.md) were approved for publication on 26 October 2026. The source inventory and eleven implementation tickets are published in Linear. Implementation has not started. Continue with `$deliver HELIX-34` when requested.
