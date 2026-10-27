# Finance specification

Feature: `helix-finance-migration`
Revision: 1
Status: approved, published in Linear
Prepared: 26 October 2026
Tracker: Linear, Helix NMBU team `HELIX`, project `P-HELIX-4`
Milestone: `Finance`, `eb62b788-596a-4920-ab8d-cfda9aa53cc0`, renamed from Financial Budgets
Parent: [HELIX-34](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing)
Scope: [scope.md](scope.md), decisions D1 through D9
Ticket plan: [tickets.md](tickets.md); published implementation ticket copies under `issues/`

## Contract and approval

The user approved specification revision 1 and its eleven-ticket plan on 26 October 2026 by selecting "Approve and publish in Linear" in the complete-plan approval request. This approval includes the request lifecycle and operational choices below. The approved draft SHA-256 is `e5b99484a53347f7ca8f72ccc4c81f0726b064ec21b91fae0439e1f538d51c22`. Publication identifiers and verification are recorded in publication.json.

The user's approval of revision 1 authorizes publication of one specification parent, eleven implementation children, their native blocking relationships, one implementation label and the updated existing milestone. It also authorizes attaching the supplied inventory as a source document in Linear. It does not authorize coding, changing databases or grants, sending email, creating implementation branches, pushing, merging or deploying.

Publish the approved specification text in the parent. Keep its revision and local copy synchronized. Record the user's approval source, date, parent ID, child IDs and actual publication outcomes here and in `publication.json`. Do not mark this revision approved before the user approves this concrete plan.

## Sources and verified context

- [scope.md](scope.md) is the agreed product scope. [source-inventory.md](source-inventory.md) preserves the supplied inventory exactly, SHA-256 `db023b45a104ec667dc863971d1bb53f70286de2f483bd8fa60e62bb1258d1e6`.
- Inventory sections 7 through 14 specify baseline fields and behavior. Section 19 provides regression examples. The old repository at `oskarrandel/helix-finance`, commit `6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9`, remains untouched. Its reported tests were not rerun here, and its live data was not inspected.
- `CONTEXT.md` distinguishes access roles from organizational positions, and requests from registered purchases, commitments and invoice obligations. There are no research, prototype or questionnaire artifacts beyond the recorded user answers, and no relevant ADR is required for preparation.
- Current workspace is `codex/project-management` at `fd58ee01c8183b069ff0f3809911a40eff4f5826`, with unrelated edits. It is not the integration base. Preserve all those edits.
- GitHub metadata confirms the remote default branch is `main`. GitHub's main snapshot read during preparation is `f755d3105a4eec76c2ae54db1040a557e11fc26e`. Local `origin/main` was older at `75e9638ed71df854773023fff32ce8d5e50d8c9b`. Refresh and resolve the actual base when delivery starts.
- Main already has `identity.departments`, member departments/roles, feature grants, `MemberFeatureAccess.tsx`, `MemberAccessPage.tsx` and `api/_lib/member-access-service.ts`. Reuse them. The current checkout lacks parts of this newer system, so the scope's earlier local-only observations do not describe current main.
- Main's `identity.member_features` expands the platform-administrator wildcard. A `team.finance` feature also exists. Neither grants private finance capabilities under this specification.
- Main uses React/TypeScript/Vite, Neon Managed Better Auth/Postgres/private storage, AWS S3 SDK adapters and shared member notifications. Main's `scripts/local-api.mjs` allows a 2 MiB body. Its current test command uses two workers and its install/build include the email sanitizer step. Preserve that setup.
- The current checkout's function guard reports 9 source functions. This is not a count for the newer remote main or the eventual integrated feature. Recount both source and generated output at delivery.

## Outcome and boundaries

Members manage finance inside `internal.helixnmbu.no` through Overview, Purchases, Budgets and Financing. The module starts with new S27 records, permits department budget CSV import, and preserves implemented source calculations and workflows except for the agreed changes. Purchase requests, approvals, commitments and partial fulfillment are new functionality.

Excluded: source/historical-record migration, old repository or live Sheet/Drive writes, accounting/tax/payroll, bank transfers or reconciliation, verified cash balances, FX, in-kind costing, OCR/AI, supplier master-data management, sponsor CRM, engineering/BOM/assets/cost events, registered-purchase amount corrections or reallocation, general member expense history, predictive forecasts and budget versions/reopening. Do not add a platform-wide role administration redesign or hosted staging.

## Observable requirements

| ID | Pass condition |
| --- | --- |
| F-01 | Verified active Helix Google members reach Finance Overview, Purchases and public Budgets regardless of department. Finance defaults to Overview. The four real pages replace sample navigation; legacy Budget/Expenses links redirect. Partner OTP, signed-out or banned identities cannot use Finance. |
| F-02 | Every read, mutation, export and file operation enforces the capability matrix below before returning private data or producing side effects. A title, department, recruiting grant or platform-administrator wildcard grants no private finance authority. Revocation/account changes cannot leave usable private cached data or accept stale responses. |
| F-03 | S27, department/system mappings, settings and exact NOK/date rules are consistent across all pages. Amounts include VAT, line amounts are totals, Oslo dates do not shift, and actual/plan/commitment/funding/payment are separate facts. No production finance examples or real-user grants are seeded. |
| F-04 | Head of Finance creates one draft season budget and approves it once with actor/date/audit. Active systems have protected zero-plan unallocated items. Funding may exist before budget creation; actual registration and requests explain missing-budget dependencies. |
| F-05 | Members browse department/system/item plans, actual and difference. Finance maintains draft items and the allowed approved-item fields. Head of Finance makes protected approved-budget changes with a reason. Cancellation/restoration preserves IDs, stored plan and actual. EM links satisfy season and single-system invariants. |
| F-06 | Department CSV text/file preview writes nothing and shows row classifications, old/new values, cancellations, spending warnings and authoritative totals. Import revalidates revisions/permissions and commits all changes or none. Re-import preserves matching IDs, optional omitted fields and other departments. |
| F-07 | Business and finance create/edit funding and parts, inspect their fields and derived usage, reveal/soft-delete/restore funding, and retain all links/audit. Over-earmarking warns with exact excess while saving. No earmark destructive-delete action exists. |
| F-08 | A member saves/submits/follows their own request; no receipt is required before buying. Submitted lines identify budget allocations and estimates. A planned purchase less than three calendar days away requires a late reason but is accepted. Only Head of Finance approves/rejects, recording immutable revision/line amounts/actor/time/reason. |
| F-09 | Open approved request lines reserve `max(0, approved - linked registered actual)`. Several registrations consume one approval. Explicit closure releases unused commitment. Voids restore commitment only while the request remains open. Concurrent registrations cannot lose updates or duplicate approval balances. |
| F-10 | Valid registration saves one actual purchase with lines, one full-value allocation per line, private evidence, a unique public reference and audit. It enforces source field/line rules and a strict 20 saved registrations per requester in the preceding hour. Lost responses/retries cannot duplicate records or side effects. Missing approval or an overrun does not suppress incurred actual cost. |
| F-11 | Members upload 1 to 15 allowed files of at most 10 MiB each using owned private staging. Finalization verifies actual content/size and safe stable file ownership. Only finance can retrieve finalized evidence. Missing files, replayed upload tokens or a lost finalization response cannot yield duplicate purchases or successful records with missing evidence. |
| F-12 | Finance sees the purchase register and unpaid count/filter. It marks/undoes outlay reimbursement and the single invoice obligation's payment state, with dates/audit and valid parent-state checks. Supporting files share that invoice state. Voiding with a reason retains facts/documents, removes actual/unpaid work and updates open request commitments. |
| F-13 | Direct purchases strictly above the current NOK 5,000 threshold without prior approval, linked cumulative overruns and approval-line mismatches are recorded with Finance review flags. Finance records a review outcome/reason without rewriting approval history, actual or payment. Member request views reveal only their permitted summary/reference data. |
| F-14 | Every scenario includes actual plus the larger of open approved commitments and scenario-eligible remaining plan, per item. Source funding eligibility, restricted cover, gaps and deadline-aware earmark use remain correct. Unused restricted money never covers unrelated need; scenario shortfalls stay advisory. |
| F-15 | Overview and Budgets show accurate department/system/item totals, unbudgeted spending and public earmark usage; permitted users see funding scenarios and commitments. After relevant changes, fresh read-only views update without losing location. Dirty forms retain input and receive shared update/recovery notifications. |
| F-16 | Registration emails reach active finance/Head of Finance recipients; submitted requests notify Head of Finance, and decisions notify the requester. Saved events have durable status and safe retry/reconciliation. Email failure never rolls back a purchase or approval and refund details never enter email/logs. No mail is sent by preparation. |
| F-17 | Finance can export an authorized purchase/line/document manifest and retrieve archived evidence through checked access. Exports retain references, payment/void states, allocations, warnings and useful attachment identifiers without refund numbers or long-lived public links. Upload cleanup and uncertain-delivery recovery are usable through controlled operations. |
| F-18 | English shadcn/ui pages follow the current theme, keyboard/mobile behavior and shared notifications. Fixtures stay in dedicated loopback development mode. Source/generated functions remain at most 11 and static output stays within the existing build budget. Integrated tests, local browser checks and independent review establish code readiness; configured-service evidence and authorized release remain explicit completion gates. |

## Access contract

Use existing verified `identity.members` and `identity.departments`. Add a finance-specific grant relation keyed by member ID, with explicit active `business`, `finance` and `head_of_finance` capability profiles. Head of Finance includes Finance and Business finance-module capabilities; Finance includes funding management. Business gains no purchase-register access. Multiple explicit profiles form a union. Ordinary verified members need no elevated grant for public budgets, submission or own requests.

Resolve these capabilities in a dedicated Finance response. Do not put private capabilities in the generic wildcard feature catalog or infer them from `helix_role`, department or the four existing platform roles. Reuse existing member identity and navigation infrastructure, but bypass `team.finance` gating for public Finance pages. Preserve all unrelated feature grants. Provision/revoke finance profiles through an audited, trusted operator path, with no hardcoded real recipients or automatic self-grant. A new general access editor is excluded.

| Capability | Member | Business | Finance | Head of Finance |
| --- | --- | --- | --- | --- |
| Public budgets/earmarks; actual registration; own requests | Yes | Yes | Yes | Yes |
| Financing, sources/conditions/scenarios; manage funding/parts | No | Yes | Yes | Yes |
| All purchases/request context; files/refund details; payments/void/review | No | No | Yes | Yes |
| Draft budget items; allowed non-protected approved fields; permitted imports | No | No | Yes | Yes |
| Create/approve budget; protected approved edits with reason; approve/reject requests | No | No | No | Yes |

Public responses omit suppliers/requesters and all purchase rows, attachments/refund values, private funding sources/conditions and scenarios. Own-request responses add only that member's request content/decisions, approved/fulfilled/remaining/released amounts and related purchase references, dates and totals. They do not grant invoice/receipt download or a general purchase-history list.

## Finance data and API contracts

Proposed implementation locations are `src/features/Finance/`, `api/_lib/finance-*` and additive `db/migrations/*_finance_*.sql`. These paths do not yet exist. Recheck migration numbers at execution; do not modify previously recorded migrations or assume the checkout's 009 through 013 project-management migrations exist on main.

Use a private `finance` schema for seasons/settings, systems linked to canonical department keys, budgets/items, funding/parts, requests/request revisions/request lines/decisions, actual purchases/lines/allocations, invoice obligations/documents, uploads, audit, idempotency records, reference counters, exception reviews and notification outbox. Internal UUIDs may accompany stable public references. Reuse member IDs and department keys; no duplicate person or department directory. A season status can reject writes after operator closure without adding a season-close UI or historical browser.

Keep money authoritative in fixed-point SQL amounts and integer-ore domain arithmetic. JSON carries canonical decimal NOK strings, never unchecked binary floats. Retain date-only ISO strings for purchase/due/planned/deadline dates and server timestamps for decisions/audit. Amount/date parsing follows inventory 11.1, including Norwegian separators and invalid-input rejection. The threshold starts at NOK 5,000; store the policy value used by a registration so later configuration changes cannot rewrite its historical flag.

Use one consolidated `api/finance.ts` entrypoint for JSON reads/mutations, upload authorization/finalization metadata, signed downloads and controlled recovery operations. This is a proposal for one extra function, not one route per operation. Add its mapping to the local API adapter. If current main plus this route exceeds 11, consolidate before implementation proceeds. Every action still verifies member identity and its own capability. Do not route file bytes or full attachment archives through JSON functions.

GET reads select explicit role-filtered views such as public budget, own requests, finance purchases, financing, and a cheap view-version check. Mutations use a discriminated action contract with `requestId` for idempotency and `expectedRevision` for edits/decisions. Server actors, references, approval status, totals and file paths are never trusted from the caller. Return server-derived values, view version, warnings and field/line errors. Follow existing 400/401/403/404/409/413/429/503 conventions. Use `Cache-Control: no-store` for protected data.

FIN-01 must publish the shared TypeScript contract, schema ownership and operation list before other slices start. Each later ticket owns its corresponding handler/service/domain/UI module and tests, rather than adding branches concurrently to one giant handler. The coordinator registers those modules and resolves shared routing changes.

### Baseline field and operation coverage

Inventory sections 8 through 10 remain normative for baseline validation, subject to the changes below. Publish the inventory alongside the specification so fresh workers can read its exact enums and CSV examples.

| Record or operation | Required fields and behavior |
| --- | --- |
| Budget item | System, description, category, nonnegative planned NOK, P1/P2/P3/P4/EM, same-season earmark for EM, new/reuse/inspect/consumable, optional expected date/owner/note, planned/active/done/cancelled, protected change reason. Manual defaults P1/material/new; CSV defaults P2/other/new remain distinct. |
| Funding | Nonblank source and owner name, sponsor_cash/grant/membership/other, positive amount, prospect/applied/secured/received/rejected/deleted, optional confidence high/medium/low, expected/received dates, owner email, reporting flag, agreement link/note. Preserve flexible status/date behavior. |
| Earmarked part | Parent funding, purpose, positive exact amount, optional spend-by date and private conditions; derived system through non-cancelled linked items. Add/edit, no destructive delete. |
| Registration | Nonblank buyer/supplier, purchase date no later than today, team_account/outlay/invoice, justification at least 10 trimmed characters, receipt/invoice document type, invoice due date when applicable, optional document number, files and lines. Outlays require account with 11 digits or phone with 8; non-outlays discard stale refund fields. |
| Purchase line | Active system, eligible current-budget item or explicit unbudgeted choice, nonblank description, finite positive quantity and positive total NOK. Changing department/system clears incompatible selections. Quantity is not multiplied into line total. |
| CSV | Required system_id/description/planned_nok, optional priority/category/reuse_status/expected_purchase_date/note/earmark_id; comma/semicolon, quoted/newline/escaped/BOM/CRLF behavior, line errors, duplicate and unknown-header rejection. Match exact system ID and normalized description; preserve omitted optional fields and linked IDs. |
| Payment and void | One invoice obligation per invoice purchase and separate outlay reimbursement if applicable; checked mark/undo. Void only registered purchases, with reason. No unvoid, permanent purchase deletion, amount editing or reallocation. |

Preserve source permission for Finance to change an approved item's system when it is otherwise a valid non-protected edit; audit it. Do not silently add a new Head-only restriction. Earmark system invariants still apply. A registered allocation retains its original item reference and historical context; show current grouping consistently and retain before/after system history.

### Request lifecycle proposed for approval

| Current state | Actor and action | Result |
| --- | --- | --- |
| Draft | Requester edits or submits | Save a revision, or submit an immutable snapshot. Validate supplier/justification/planned date/positive estimated lines. Require a late reason below three calendar days. |
| Submitted | Requester withdraws | Return to editable draft, retaining the submission event. Any stale approval against the old submitted revision fails. |
| Submitted | Head of Finance approves or rejects | Record decision/reason/actor/time and approved line amounts. Only approved positive line amounts create commitments; at least one approved line must be positive. |
| Rejected | Requester revises and resubmits | New revision, with previous rejection retained. No commitment until a new approval. |
| Approved and open | Requester registers several purchases | Link each actual line to its approved request line; update cumulative fulfillment atomically. Approved content cannot be overwritten. |
| Approved and open | Requester or Head of Finance closes with reason | Release unused approval and retain actual, decision and release history. Closing is explicit even if the remaining balance is zero. |
| Draft/submitted/rejected | Requester cancels | Retain a cancelled record with no commitment. |
| Closed/cancelled | Read only | No silent reopening or amendment. A new request may reference the old one; it creates a separate reviewed approval. |

Request access remains private to requester and finance. Finance can inspect request context for expense work, but cannot approve/reject or close another member's request without the Head of Finance grant. An approved request's requester can close their own remaining commitment. No delegation, recurring requests, partial-approval appeals or urgent-period bypass is included.

Fulfillment links require the same requester, season and budget item. Finance may register its own expenses, but proxy fulfillment for another member is excluded from the first release. Invalid links fail with a recovery path to record the actual expense directly and retain the request reference as exception context. A valid approval that is exceeded still accepts actual cost and creates a review flag. A purchase dated before its approval date is flagged; the stored decision timestamp and member-supplied purchase date do not certify within-day purchase order.

### Calculation contract

`actual(item)` sums registered purchase allocations, including unpaid invoices. Voids contribute zero. `effectivePlan` is zero for cancelled items; `difference = effectivePlan - actual`. Unallocated items have zero plan. Zero plan produces undefined budget-use ratio, not division by zero.

For each open approved request line, `remaining = max(0, approved - registeredLinkedActual)`. Sum remaining lines per item. A closed/cancelled request contributes zero commitment. A void reopens its released actual into commitment only if the request remains open. Commitments are derived, not a mutable total independently decremented by clients.

For each item and scenario, `need = actual + max(commitments, eligibleRemainingPlan)`, where `eligibleRemainingPlan = max(0, effectivePlan - actual)` if priority/funding is eligible, otherwise zero. Funding eligibility remains received/secured with P1; add high-confidence applied and P2; finally all applied/prospect and P3/P4. Rejected/deleted funding is excluded. Actual and approved commitments are included regardless of ordinary priority.

Apply inventory 11.5 after determining need: eligible funding minus eligible earmarked parts is unrestricted funding; a part covers at most its amount and its linked need; the gap is uncovered general need minus general funding, floored at zero. Negative unrestricted remainder remains possible. Deadline-aware usage separately counts only registered allocations dated on/before spend_by, caps used at the part amount, and reports unused left as must-return starting the next Oslo day. Do not add deadline filtering to scenario eligibility.

Required examples: approved 10,000 and registered 4,000 produces 6,000 committed. An eligible 12,000 plan yields need 12,000, not 18,000. An excluded priority still yields need 10,000 from actual plus commitment. Actual 11,000 against approval 10,000 produces zero remaining and an overrun review flag. Multiple requests for one item sum commitments before the max with remaining plan.

### Storage, recovery and notifications

Use a dedicated private finance bucket configured through a server-only `NEON_FINANCE_BUCKET`, alongside the existing endpoint/region/credential conventions. Do not change CV/application bucket semantics. Authorize a random upload key and limited lifetime for one member/submission. File bytes go directly from the browser to storage. Validate extension/type, byte size and supported file signatures; preserve sanitized useful filenames. No OCR, antivirus-service purchase or file conversion is required.

Do not reuse a still-writable staged object as permanent evidence. Finalization must capture verified bytes under a fresh key that the upload signer cannot overwrite, with size/content identity recorded. Treat object copy/finalization as recoverable external work around the database transaction. A saved purchase requires verified finalized evidence; cleanup must confirm no saved purchase references a key before deleting it. A client may retry a lost response with the same idempotency key. Finalized-file GET URLs expire within the existing 120-second convention and are minted only after fresh Finance authorization.

The current provider supports presigned upload/download and S3 object operations, but delivery must prove finalization, CORS and the 10 MiB boundary against the configured branch. Provider lifecycle/versioning settings are not a substitute for application cleanup or immutable final keys. [Neon S3 compatibility](https://neon.com/docs/storage/s3-compatibility), [Neon object operations](https://neon.com/docs/storage/objects).

The direct upload design avoids the local 2 MiB body limit and Vercel's documented 4.5 MB function payload limit. Keep mutation bodies small. [Vercel function limits](https://vercel.com/docs/functions/limitations).

Persist notification intent with the business transaction and deliver outside it. Deduplicate per event/recipient, record sent/failed/uncertain outcomes, retry only when safe, and expose authorized recovery actions. Request submission targets Head of Finance, decisions target the requester, registrations target finance and Head of Finance. Email links require sign-in and fresh authorization. Never embed refund destinations or durable signed download URLs. Reuse the existing server mail provider configuration and local recipient allowlisting; do not require connecting each member's Gmail.

Finance review outcomes are `reviewed` with reason, actor and time. Original exception kinds and at-registration approval facts remain immutable. A review never marks the request approved or the invoice paid. New evidence can be recorded in a later review event; it cannot replace the original audit.

The purchase export contains one purchase summary plus line/allocation and document manifests, safe text and current derivations labeled as such. Exclude private refund values and public download URLs. A Finance-authorized archive operation resolves document IDs after a fresh check; produce larger export files in private storage when they would exceed function payload limits. Supply a controlled cleanup/retry command or action and a restoration/recovery runbook, with no new scheduled service required for this release.

## Tickets and dependencies

| Local ID | Behavior | Requirements | Direct blockers |
| --- | --- | --- | --- |
| [FIN-01 / HELIX-35](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes) | Establish Finance access, data contracts and protected routes | F-01, F-02, F-03, F-18 | None |
| [FIN-02 / HELIX-36](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets) | Create, approve and maintain season budgets | F-04, F-05 | [FIN-01 / HELIX-35](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes) |
| [FIN-03 / HELIX-37](https://linear.app/helixnmbu/issue/HELIX-37/fin-03-manage-financing-and-earmarked-funding) | Manage financing and earmarked funding | F-07 | [FIN-01 / HELIX-35](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes) |
| [FIN-04 / HELIX-38](https://linear.app/helixnmbu/issue/HELIX-38/fin-04-preview-and-atomically-re-import-department-budgets) | Preview and atomically re-import department budgets | F-06 | [FIN-02 / HELIX-36](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets) |
| [FIN-05 / HELIX-39](https://linear.app/helixnmbu/issue/HELIX-39/fin-05-submit-requests-and-record-head-of-finance-decisions) | Submit requests and record Head of Finance decisions | F-08, F-09 | [FIN-02 / HELIX-36](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets) |
| [FIN-06 / HELIX-40](https://linear.app/helixnmbu/issue/HELIX-40/fin-06-register-actual-purchases-with-private-supporting-files) | Register actual purchases with private supporting files | F-10, F-11 | [FIN-02 / HELIX-36](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets) |
| [FIN-07 / HELIX-41](https://linear.app/helixnmbu/issue/HELIX-41/fin-07-fulfill-requests-through-several-actual-purchases) | Fulfill requests through several actual purchases | F-09, F-13 | FIN-05, FIN-06 |
| [FIN-08 / HELIX-42](https://linear.app/helixnmbu/issue/HELIX-42/fin-08-process-unpaid-work-voids-and-approval-exception-reviews) | Process unpaid work, voids and approval-exception reviews | F-12, F-13 | [FIN-07 / HELIX-41](https://linear.app/helixnmbu/issue/HELIX-41/fin-07-fulfill-requests-through-several-actual-purchases) |
| [FIN-09 / HELIX-43](https://linear.app/helixnmbu/issue/HELIX-43/fin-09-show-commitment-aware-scenarios-and-finance-overview) | Show commitment-aware scenarios and Finance overview | F-14, F-15 | FIN-03, FIN-07 |
| [FIN-10 / HELIX-44](https://linear.app/helixnmbu/issue/HELIX-44/fin-10-deliver-durable-notifications-exports-and-recovery) | Deliver durable notifications, exports and recovery | F-16, F-17 | FIN-05, FIN-06 |
| [FIN-11 / HELIX-45](https://linear.app/helixnmbu/issue/HELIX-45/fin-11-verify-the-integrated-finance-milestone-and-prepare-review) | Verify the integrated Finance milestone and prepare review | F-01 through F-18 | FIN-04, FIN-08, FIN-09, FIN-10 |

FIN-01 owns shared contracts and the initial schema skeleton, including request/upload/outbox interfaces, but does not implement all later services. Its protected routing and access checks must be testable. Every later ticket is responsible for its backend, affected UI and behavioral verification. FIN-05 demonstrates approval and initial commitments; FIN-07 completes actual consumption. FIN-06 delivers a complete direct-registration path before request linking is connected. FIN-10 depends on transactionally produced event contracts, not the final Overview UI.

All slices remain on one integration branch and one unmerged feature PR. Blockers are functional prerequisites. Shared file ownership imposes additional scheduling restrictions described in tickets.md; it does not invent extra graph edges. FIN-11 cannot substitute mock-only tests for real concurrent Postgres/storage acceptance.

## Verification and prerequisites

Use the existing Vitest/component and injected-service seams, PGlite SQL integration pattern and local API adapter. Add Finance-specific tests at the same boundaries. For concurrency claims that PGlite cannot demonstrate with independent transactions, use isolated local Postgres or an authorized isolated Neon branch. Never run test transactions against production merely because an environment file exists.

At the verified main snapshot, Node is 24.x, `.nvmrc` selects 24.19.0 and npm is 11.17.x. Current host reports Node 24.19.0/npm 11.17.0. `npm ci` runs main's existing sanitizer postinstall. Recheck the base's commands before execution.

```sh
npm ci
npm run typecheck
npm run typecheck:api
npm run typecheck:api:runtime
npm run lint
npm test
npm run build
git diff --check
```

Use focused test paths from each implemented slice during development; run the complete integrated checks before review. Main's npm test uses two workers. Preserve resource-related evidence honestly rather than increasing timeout limits or skipping assertions to claim success.

For fixture browser checks, use `npm run dev:member` on loopback. For real local service acceptance, use an untracked `.env.local` and `npm run dev -- --host 127.0.0.1 --port 5190 --strictPort`. These are different evidence classes. Verify desktop/mobile, keyboard access, all four profiles, direct denied endpoints, account switch/revocation, CSV invalid/stale imports, partial approvals/fulfillment, lost responses, 10 MiB/15-file boundaries, invoice/outlay settlement, void before/after closure, deadline boundaries and restricted shortfalls.

Before production use, an operator must provide approved systems mapped to existing department keys; S27 context; explicit Business/Finance/Head grants; an unused annual purchase-reference start; private bucket/CORS and matching branch credentials; email sender/recipients; retention/export/recovery ownership. `npm run neon:setup` is a read-only migration report and `--apply` mutates its selected database. Reconcile the existing migration ledger before applying additive Finance migrations. Preparation runs neither command against a database.

## Execution context

- Base branch: GitHub-verified `main`, refreshed at delivery. Do not base Finance on the current unmerged project-management branch or merge its unrelated history into this feature. Finance does not depend on Project Management integration.
- Proposed integration branch: `codex/finance`; worker names `codex/finance-fin-01` and corresponding ticket IDs. No branch or worktree was created during preparation.
- At authorized delivery, inspect existing attached worktrees and reuse a suitable clean checkout or create a managed worktree from refreshed main. Preserve the current checkout. Copy only these reviewed Finance documents and the agreed finance glossary addition into the integration worktree; reconcile with its existing glossary instead of replacing it.
- Snapshot unrelated dirty paths at start. Allocate new migration filenames centrally after reading current main; workers must not claim the same numeric suffix. Recheck shared interfaces when workers start.
- No proactive subagents were used in preparation. Delivery scheduling must follow the active user, AGENTS.md and Deliver instructions; proposed worker names do not themselves authorize spawning agents.
- Once the user requests delivery and authorizes publication of its PR, use one feature PR to main, attach it to the chat, run exact-head CI and include meaningful UI screenshots. Do not merge or deploy automatically. Production migration/grants/storage/email setup require the applicable user authorization.

## Linear publication plan

After approval, recheck for an existing Finance parent/children before creating anything. Rename/update the existing milestone to Finance, preserving its ID, dates and unrelated project content. Create one specification parent in this project/milestone with the existing Feature label, Backlog state and no worker assignment. Attach the inventory as a clearly attributed source document and link it from that parent.

The HELIX team currently has Feature, Bug and Improvement labels, with no implementation-ready label. Create one `ready-for-agent` label for approved implementation children only. FIN-01 begins Todo; dependent children begin Backlog with native `blockedBy` relationships. All children link the parent, project, milestone, local ID and approved requirement IDs. Do not assign people, due dates or estimates that the user has not supplied. A ready label never overrides native blockers.

Publish blockers before dependents in the table's topological order, persist each returned ID immediately and verify readback of parents/milestones/dependencies/labels. After uncertain outcomes, query before retrying. Do not report complete publication while any approved child or relationship is missing. Leave other project milestones and existing issues unchanged.

## Completion and handoff

Prepare is complete only after revision approval, verified publication of the parent and all eleven tickets, and a saved identifier map. The initial eligible implementation work is FIN-01; no coding starts in Prepare. The next normal instruction is `$deliver <Finance-parent>`.

Delivery code readiness requires all requirement coverage, integrated checks, independent Standards and Spec review, actual UI inspection and an unmerged PR with current CI where publication is authorized. Configured-service acceptance and any authorized production release must be recorded separately; neither local fixtures nor source test reports prove them. Do not close the whole milestone while required acceptance remains unverified.


## Publication record

Approved revision 1 is published under [HELIX-34](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing) in the existing Finance milestone. All eleven implementation children are published as HELIX-35 through HELIX-45. Native blockers, project/milestone membership, parent links, child-only labels, initial states and absent assignments were checked by reading every issue back. The [source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49) was read back in full; content matches after Linear's Markdown formatting normalization.

Initial eligible work is [HELIX-35 / FIN-01](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes). Other tickets retain native blockers. Implementation has not started. The next normal instruction is `$deliver HELIX-34`. Publication identifiers and verification results are recorded in publication.json.
