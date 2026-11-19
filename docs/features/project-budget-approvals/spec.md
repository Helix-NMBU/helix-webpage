# Project budgets, approvals and purchases specification

Feature: `project-budget-approvals`
Revision: 1
Status: approved, published in Linear
Prepared: 19 November 2026
Tracker: Linear, team `HELIX`, project `P-HELIX-4`, existing Finance milestone `eb62b788-596a-4920-ab8d-cfda9aa53cc0`
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), related to HELIX-34 and HELIX-63.
Scope: [scope.md](scope.md), confirmed decisions D1 through D10.
Ticket plan: [tickets.md](tickets.md). Individual drafts are in [issues/](issues/).

## Approval contract

The user approved specification revision 1 and all nine task drafts on 19 November 2026 by selecting "Approve and publish in Linear" in the complete-plan approval request. Approval covers one specification parent, nine implementation children, native blockers and the existing publication metadata. The approved draft hashes and exact answer are recorded in publication.json. Application implementation has not started and is not authorized by publication approval.

After approval, publish one new specification parent and nine implementation children in the existing Finance milestone. Relate the parent to the existing Finance and Partner deals parents; do not overwrite their historical requirements or reopen completed tickets. Use the existing `ready-for-agent` label on implementation children only, leave assignments and dates unset, and use native blockers. Approval of publication alone does not authorize coding, branch creation, database or Drive changes, sending messages, pushing, merging or deploying. Record the approved revision, exact user answer and publication/readback results in this file and publication.json.

## Sources and verified context

- The [Linear scope](https://linear.app/helixnmbu/document/project-budgets-approvals-and-purchases-scope-992741c7eff0) and repository scope contain the user's decisions. The document has no comments as of this preparation. CONTEXT.md distinguishes project leads from the Project Manager role and purchase completion from invoice payment.
- [ADR 0001](../../adr/0001-store-finance-invoices-in-shared-drive.md) records the user's deliberate choice of shared Drive for new uploaded invoices. Neon remains data/auth and may provide private upload staging; historical attachments stay where they are.
- [Drive research](drive-invoice-research.md) verifies official API mechanics, including shared-drive support, resumable transfer and pre-generated IDs. It does not verify Helix's actual destination, credentials, narrow OAuth scope or reader access. The service setup gates below remain open.
- GitHub repository metadata and the main branch endpoint verified default branch `main`, at `b05c5a457a378a76aaba7535ab6c0664505cf089` on 19 November 2026. The required check reported by that branch is `verify`. Recheck at delivery rather than treating this snapshot as permanent.
- That remote snapshot has 11 top-level API routes. The current working tree has 13 because it also contains separate rejection/confirmation wrappers, and its function guard fails at 13/11. The local checkout is `codex/member-profile-project-management-fixes` at `9c5f7282becc4820362b8878d7ecc7c44ae1be9d`, with extensive unrelated changes; local origin/main is older than the verified remote snapshot. Do not carry those changes or wrappers into the feature automatically.
- The inspected implementation has a single season budget, draft/approved states, stable budget-item allocations, private file uploads, request commitments, Finance review, exact money and outbox delivery. Current Financials grants broadly enable Finance capabilities; Head of Finance is an additional explicit grant. Department membership, project lead assignments and space permissions are separate systems.
- The project already has React/TypeScript/Vite, Neon/PostgreSQL, shared shadcn controls, Radix interactions, UI SDK behavior and shared notifications. Relevant code paths in the tickets were inspected locally and must be checked against the delivery base before editing.
- The old HELIX-34 requirements are superseded only for project-budget ownership/versioning, the sequential approval chain, removal of the NOK 5,000 rule and new Drive invoice storage. Existing actual-cost, payment, restricted-funding, audit, retention and authorization protections remain applicable. HELIX-35, HELIX-45 and HELIX-69 have historical acceptance work; their statuses do not establish current service readiness and are not new blocking dependencies by themselves.

No prototype or advisor questionnaire was used. Unslop applies to this specification and all ticket drafts.

## Outcome and boundaries

Any assigned project lead drafts one project budget per season, with one responsible department. A department lead approves the submitted version before Head of Finance can approve it. Project and department spaces expose those scoped workflows; Finance shows submitted and approved budgets.

A project lead, responsible department lead or Finance can request a revision. The last approved version stays effective while a new version passes both reviews. Department leads and Finance register actual purchases against approved entries, including partial fulfillment, upload invoices for automatic shared Drive storage, and see invoice links from purchased budget entries. Incurred costs outside the approved budget are recorded and reviewed. Remove the NOK 5,000 rule completely.

Head of Finance inspects relevant funding application cards, links or proposes entries, and records funding awards. Linked entries become mandatory P0 on award. Only Head of Finance can release an obligation with a reason. A funding award never approves new or increased budget amounts.

Excluded: general accounting, bank transfers/reconciliation, invoice generation, OCR, a full grants CRM, broad access-role redesign, historical attachment migration, unrelated API/UI cleanup, legacy Supabase imports, production migration or release during Prepare. Preserve cash funding versus product/service estimates and existing paid/void/reimbursement facts.

## Observable requirements

| ID | Pass condition |
| --- | --- |
| F-01 | Any currently assigned project lead can draft/edit/submit that project's budget without organization-wide Financials access. Exactly one budget exists per project and season, with a selected responsible department among that project's departments. Server rejects cross-project/season/system mismatches and unassigned authors. |
| F-02 | The stages are Draft, Sent to approval (Department lead), Sent to approval (Finance), Approved. Any current lead of the responsible department may give the first approval; only explicit Head of Finance may give the second, against the same submitted contents. Return for correction needs a reason, returns the candidate to Draft and restarts both approvals. Skipping stages, duplicate decisions and stale approvals fail safely. |
| F-03 | Request changes is available to assigned project leads, responsible department leads and Finance. It creates or returns the one pending candidate from the last approved version. Only project leads edit its entries. Both reviewers see added/removed/edited values and total differences against the last approved version. The last approved version remains available for purchases and totals until atomic promotion; old approvals, removed entries and purchased evidence remain traceable. |
| F-04 | Every read, mutation, upload, evidence reference, export and background recovery action checks verified member identity and its own scoped permission. Project leads get only their authorized project budget data; department leads can approve/register within their department; existing Financials users retain Finance operations; Head of Finance additionally controls final approval and P0. Partner OTP, generic sessions, titles and administrator wildcards confer no new finance authority. Revocation clears stale private views. |
| F-05 | Finance lists all submitted budgets with their stage and all effective approved budgets, with project/department/stage filters and links to details. Only department-approved candidates are actionable in Head of Finance's queue. A budget with an approved version and pending revision exposes both facts without duplicating the approved total. Project and department entry points lead to the same records. |
| F-06 | Register a purchase selects approved project entries or explicitly records an already-incurred unbudgeted cost. Cumulative actual above approved plan and purchases without an approved entry are recorded and flagged for Finance review, including before the first project budget approval. No amount, including NOK 5,000 or NOK 5,000.01, requires separate prior purchase approval. Remove all active threshold prompts, settings consumption, SQL flags, emails and current-policy export calculations. |
| F-07 | Several purchases can fulfill an entry. Each keeps its own quantity, total actual, allocation and evidence. An authorized registering department lead or Finance explicitly marks an entry complete and can reopen it with a reason. Spending the planned amount does not mark it complete or paid. A linked void preserves history and clears completion for review, without deleting purchases or reopening closed legacy requests. |
| F-08 | Users upload 1 to 15 supporting PDF/image files of at most 10 MiB through registration. New invoice evidence is transferred automatically to the configured shared Drive folder after owned, verified private staging. One registration/retry creates one expense and at most one Drive file per evidence record. Pending, stored and needs-attention evidence are distinct from purchase/payment states. Transfer failures retain recoverable evidence and show actionable shared notifications; stored requires verified Drive confirmation. |
| F-09 | Finance budget entries show not purchased, partially purchased or complete, actuals and every linked invoice. A Drive link appears only for confirmed evidence; pending files have a recovery action. Existing private-storage invoices, optional requests, approvals, commitments, imported purchases and actual/payment/void history remain readable and behave consistently. No historical fact is rewritten merely because the threshold was removed or a project budget changed. |
| F-10 | Business & Marketing can identify a pipeline card as a funding application and request/link its budget context. Head of Finance can view the relevant application card and purchase conditions without obtaining the unrelated private pipeline. Head of Finance records an award with actor/date/evidence reference; only awarded obligations derive P0. Proposal, submission, Won and funding reconciliation alone do not. New entries/increased amounts still require both budget approvals. |
| F-11 | P1 through P4 remain the manual ordinary-priority choices. Each active awarded obligation makes its stable entry P0. Project edits/imports cannot remove/downgrade or indirectly cancel an active P0 obligation. Only Head of Finance releases it with a required reason, preserving award/history. Release restores the effective version's ordinary priority only when no active obligation remains. Funding edits/cancellation, missing cash or deleted links cannot silently release it. |
| F-12 | Approved project, department, system and season totals count each effective stable entry and actual once. Pending revisions never enter approved totals. Approved P0 remaining plan is mandatory in every scenario independently of funding eligibility; restricted funding coverage and legacy request commitments remain separate and cannot double count the plan. Unbudgeted/removed-entry actuals remain visible. Existing public Season Overview summaries retain their authorization and omit invoice/pipeline details. |
| F-13 | Additive migration and a dry-run mapping process preserve existing budget-item IDs/public references, allocations, requests, commitments, invoice identifiers, audit and payment history. Existing approved legacy plans remain effective during transition until their mapped replacement is approved, then switch atomically. New mapped project candidates start Draft and acquire real sequential approvals; no department approvals are fabricated. CSV/import writes target candidate revisions and cannot bypass review or P0 protections. Unmapped records remain explicitly visible and are never assigned to invented projects. |
| F-14 | Decisions, revisions, completion changes, awards/releases, review and evidence events retain actors/times/reasons and version references. Submitted/returned/approved budgets notify the responsible reviewers or authors through existing app notifications and durable outbox mechanisms without leaking invoice or private deal data. Retry cannot duplicate decisions, purchases or tasks. Refresh updates all affected views while retaining dirty input and rejecting stale writes. |
| F-15 | English UI reuses shadcn/theme/shared notifications and suitable Radix/UI SDK behavior. Dedicated loopback fixtures cover all roles; production uses real authorization. Relevant tests, all typechecks, lint, build and source/generated function guards pass at at most 11 functions. Real PostgreSQL race checks, local browser evidence, independent review and exact-commit PR CI establish code readiness. Configured Drive access and the approved data-mapping plan are explicit release gates, with no automatic merge or deployment. |

## Proposed contracts for approval

These make the scope executable. They become the delivery contract only when revision 1 is approved.

### Versions and transitions

- Give each project budget a stable header with season, project, responsible department, effective approved-version ID and optional pending-version ID. Give entries stable allocation identities and immutable submitted/approved version contents; retain ordinary priority separately from derived P0 and restricted-funding links.
- Use internal candidate statuses `draft`, `department_pending`, `finance_pending`, `approved`, with exactly the four user-facing labels in F-02. The budget header can point to both an approved version and a pending version; its effective approved contents do not become Draft when a revision begins.
- Create/submit only through assigned project leads. A responsible department defaults from a single project department; a multi-department project requires explicit selection. Once submitted, changing contents or responsible department first returns the candidate to Draft and invalidates its approvals. Submission without a valid department/lead fails with an actionable notification; never forward silently to Finance.
- A reviewer at their stage can return the candidate to Draft with a reason. A project lead can withdraw a pending candidate to Draft with a reason. Request changes against an already pending candidate reuses it and records the request, rather than making concurrent revisions. Finance may request correction but cannot directly edit the project lead's draft.
- Current assignments determine permission on every action; membership changes do not rewrite prior decisions. Overlapping assignments are allowed to perform their existing responsibilities, with distinct recorded department and Head of Finance decisions. Do not invent a new self-approval ban or grant bypass.
- Use the last approved version as the comparison baseline. Summaries show old/new description, quantity where present, amount, priority, category, system and other changed item properties, additions/removals and net total. Keep stable IDs through removal; reject removal if an active P0 obligation remains.
- Store purchase lines against stable entry identity and the approved version used at registration. Re-evaluate cumulative actual against the current approved plan under the same transaction. A revision promotion racing a purchase must serialize, not lose actuals or retroactively claim a different approval.
- Completion is a separate audited state. A new purchase on a complete entry reopens it for review; a user may explicitly complete it again. A void clears completion if that purchase contributed to fulfillment. Review actions never alter paid/void state or manufacture prior approval.

### Access and API reuse

Use explicit scoped capabilities such as `draftProjectBudget(projectId)`, `reviewDepartmentBudget(departmentId)`, `approveProjectBudget`, `registerDepartmentPurchase(departmentId)`, `readFinanceBudgets`, `recordFundingAward` and `releaseObligation`. Resolve them from canonical current project leads, current season department leads, existing Financials access and the explicit Head of Finance grant. Finance operations retain their existing Financials boundary; scoped project/department operations do not require or grant that broad role.

Reuse `api/finance.ts` for budget, purchase, upload metadata, evidence recovery and finance reads. Reuse the existing partner-deals dispatch behind `api/member-login.ts` for application card context if appropriate. No extra top-level route is budgeted. Do not route file bytes or service credentials through JSON responses.

Publish the shared TypeScript discriminated request/response contracts in PBA-01 before consumers. Carry durable `requestId`, `expectedRevision`, stable entity IDs and server-derived capabilities/view versions. Reads return explicit project/department/Finance projections; a client-supplied project ID is a filter, never authority. Use existing no-store/error conventions. Module handlers own the feature behavior; the coordinator integrates changes to shared routers/types rather than allowing uncoordinated rewrites.

### Migration and old workflows

Expand before switching reads. Add project headers/versions, stable entry/version links, decision events, obligations, completion state and evidence backend/transfer metadata. Retain existing financial identifiers and historical tables. The implementation may extend current budget tables or add version relations; it must expose one authoritative effective-entry projection to all consumers and may not use mutable draft fields as approved facts.

Prepare a repeatable mapping manifest from real existing entry IDs to same-season project IDs and responsible departments, with old/new totals and unmapped/conflicting records. Mapping produces project Draft candidates, not synthetic approvals. During transition, keep the genuine legacy approved plan effective only for entries not yet replaced by an approved project version. Atomically retire that entry's legacy effective plan when promoting its project version, and count its actual once throughout. Retain legacy provenance in history; do not present it as completion of the new department review.

Require operator-approved mapping before live conversion; no mapping data is fabricated during implementation. Test mixed mapped/unmapped data and preserve imported historical records. Allocate new SQL migration numbers from the actual delivery base; never edit old applied migration files or assume the working tree's untracked migration 065 is installed. Update test bootstrap to load the new feature migrations; the current finance concurrency harness's 011-029 filename filter is insufficient.

Retain optional purchase-request UI/API for compatibility, with no threshold wording or automatic request requirement. Continue fulfilling/closing existing approvals and calculating their commitments correctly. Remove threshold-dependent current behavior, not historical exception evidence. Retain existing evidence providers for old files and exports. CSV preview/re-import must require a target project candidate, preserve item identity and write changes to that candidate only; a season-wide import must not mutate approved plans.

### Funding applications and P0

Add a funding-application classification/context on relevant existing pipeline cards, without replacing the sponsor pipeline or automatically converting every cash deal into a grant. Business & Marketing uses its current authorized card workflow to expose relevant application context. A dedicated Head of Finance queue returns only those cards and their application/purchase conditions, not unrelated negotiations.

Head of Finance explicitly records the award against that context, with date, reference and actor. This is distinct from sponsor Won, Finance reconciliation and cash receipt; do not create sponsor invoicing or Marketing delivery tasks merely because an application is awarded. It may link an existing canonical grant funding record; creating or receiving funding still follows existing authorized funding operations, without duplicate cash accounting.

Track one obligation per award/entry link, allow multiple active links, and store releases separately. Derived priority is P0 if any awarded, unreleased obligation applies; otherwise use the effective approved version's P1-P4 priority. Pending proposals show as pending obligations rather than approved spend. Existing EM/restricted-funding records retain their old semantics until explicitly mapped, with funding links preserved; never convert every EM item into P0. The mapping manifest must supply the ordinary P1-P4 priority for an adopted legacy EM entry.

For scenario need, retain `actual + max(open approved request commitments, eligible remaining approved plan)` per stable entry. P0 makes approved remaining plan eligible in every scenario. Funding eligibility still governs available coverage and restricted allocation, not whether a mandatory obligation exists. Keep unapproved obligation proposals visible separately from approved budget totals.

### Drive invoices and recovery

Use the existing owned private upload staging and content verification. Preserve file limits of 10 MiB each and 1-15 supporting files; do not change validation merely to fit a JSON function. New invoice final storage is shared Drive; historical private storage and other document kinds remain compatible.

After the required bytes are durably verified, commit the actual expense, allocations and evidence-transfer jobs atomically. Return the saved expense with evidence pending and a shared notification; do not show a false successful Drive upload. A Drive outage does not suppress an incurred cost. Keep a stable application document ID with backend `private_storage` or `google_drive`, digest, target folder, persisted generated Drive file ID, resumable transfer state and verification result.

Use a dedicated server identity with access to the approved shared-drive folder, no Gmail token borrowing and no automatic domain-wide delegation. Validate the narrow OAuth scope against that configured existing folder; broader scopes or alternate identities are not silently authorized by this plan. The actual Workspace shared drive, folder, credential and intended reader permissions are service setup gates.

Persist one generated binary-file ID before upload and use resumable transfer with `supportsAllDrives=true` and the fixed parent. On uncertain completion or a repeated create returning 409, verify the existing ID/destination/content rather than create another file. Keep transfer leases/retries durable, bounded and available through Finance recovery; a supported controlled runner may reuse existing finance recovery tooling without adding a deployment route. Use the stored bytes and ID on retry. Retain staged evidence until confirmed storage and the configured cleanup interval; pending/uncertain evidence is never eligible for cleanup.

After verified completion, expose the file's restricted viewer reference to authorized Finance users. Drive itself must grant the intended viewer access; do not use the service identity to proxy wider access to a narrower viewer. No public/domain-wide sharing calls. Exports retain stable document/provider references, pending states and authorized legacy-download behavior, without embedding tokens or long-lived public links.

## Verification and service gates

| Case | Evidence required |
| --- | --- |
| V-01 | Assigned lead drafts without Financials; an unassigned user and another department cannot read/write/approve. Any designated department lead can approve; ordinary Finance cannot give final approval. Revocation/account switch rejects late responses. |
| V-02 | Submit, department approve, Head of Finance approve; direct Finance approval before department fails. Return/withdraw retains input and requires resubmission. Duplicate and concurrent approvals do not overwrite decisions. |
| V-03 | Revise approved budget, add/change/remove entries, inspect both reviewers' diffs, purchase against old approval during review, promote new approval and retain old invoice/history. Competing promotion, return and purchase use independent PostgreSQL connections. |
| V-04 | Register exactly NOK 5,000, NOK 5,000.01 and NOK 8,000 without a threshold request, warning/email prefix or policy export flag. Record an incurred over-budget/unbudgeted cost before any project budget approval and preserve its review fact. Legacy approvals/commitments remain usable. |
| V-05 | Two partial purchases retain invoices and cumulative actual; completion is explicit, reopen records reason, further purchase or linked void resets completion for review. Payment remains independent. |
| V-06 | Mocked Drive faults cover denied access, corrupt/mismatched bytes, expired session, lost successful create response, verified 409 reconciliation, concurrent recovery, wrong destination and cleanup while uncertain. Authorized configured test-folder acceptance covers real small/10 MiB/multiple uploads, reader denial and legacy downloads. |
| V-07 | Application remains pending without P0; Head of Finance records award; existing entry becomes P0 without cash receipt. New/increased amounts stay pending budget approval. Project edit/import cannot cancel P0. Release needs Head of Finance/reason; another active obligation retains P0. Unrelated pipeline remains inaccessible. |
| V-08 | Mixed legacy/project data, removed-entry actual, pending revisions, partial fulfillment, P0 and restricted funding produce correct project/department/season/scenario totals with no duplication. CSV changes remain pending. Actual, expected funds and dated bank snapshot retain their separate meaning. |
| V-09 | Local browser checks cover project drafting, department queue, Head of Finance queue, Finance budgets, purchase form, invoice recovery and application obligations, including keyboard, focus/dismissal, narrow supported viewport, loading/empty/error states and preserved dirty input. CI includes real PostgreSQL cases, not only environment-skipped tests. |

Use existing service/API, PGlite and component seams. Add meaningful behavior cases rather than tests that merely mirror new helpers. Carry race cases into real PostgreSQL using a safe loopback `FINANCE_TEST_POSTGRES_URL` and the existing PostgreSQL workflow pattern. No production DB connection is a test target.

Known commands, to recheck on the delivery base:

- `npm ci`, Node 24.x and npm 11.17.x.
- `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`.
- `npm run lint`, focused `npx vitest run ... --maxWorkers=2`, then `npm test` once integrated.
- `npm run build` runs deployment-size and function checks. Run `node scripts/check-vercel-functions.mjs` against source and generated deployment output; source-only success is not generated-function evidence.
- Use `npm run dev:member` on loopback for fixtures. Use `npm run dev -- --host 127.0.0.1` with the existing local API adapter and untracked .env/.env.local for configured local services. Recheck current route mappings; no hosted staging.
- `npm run neon:setup` reports pending migrations by default; recheck the setup script and target before using it. Applying migrations to live services requires separate authorization and is not a code-validation step.

Before release, operators must supply an approved entry-to-project mapping, actual Drive/folder and dedicated credential, effective scope/ACL acceptance, and Finance approver grants. Missing inputs do not block writing/testing the implementation locally, but do block claiming configured-service/release acceptance. Do not substitute fabricated mappings, broad permissions or mocked upload results.

## Execution and completion

Intended base: freshly verified remote `main`. Proposed future integration branch: `codex/project-budget-approvals`. Worker branches, if used during separately authorized Deliver: `codex/pba-<ticket-number>-<slice>`, with isolated worktrees from the integration contract needed by that ticket. No implementation branch/worktree has been created in Prepare.

Preserve the current unrelated working tree. At delivery, refresh base metadata and compare code/setup prerequisites, then create an isolated integration checkout only under that stage's authorization. Bring only approved feature documentation and the feature's implementation; do not import all local changes. Pin and record the actual base SHA and test baseline. If the base has changed, merge forward rather than rewrite history. Use focused Conventional Commits, never force-push, and do not push until explicitly authorized.

PBA-01 establishes shared contracts/migration scaffolding; PBA-04 is independently eligible. PBA-02 follows PBA-01; PBA-03 and PBA-05 follow PBA-02; PBA-06 follows PBA-05; PBA-07 follows PBA-03; PBA-08 follows PBA-06 and PBA-07; PBA-09 follows PBA-04 and PBA-08. See tickets.md for overlap scheduling. Do not schedule solely from labels.

Code completion means all F-01 through F-15 behavior implemented, applicable checks passing, migration rehearsals and source/generated function evidence recorded, changed UI inspected with screenshots outside the repo, independent review resolved, and one focused unmerged PR against main with passing required CI. Resolve feature child tickets only against their actual acceptance evidence. Parent is a specification, never a worker assignment. Configured-service/release gates remain explicitly open if real authorized inputs are missing; do not describe mocks as service verification. No automatic merge, production migration, Drive setup or deployment.

## Ticket map

| Ticket | Linear issue | Behavior | Requirements | Blocked by |
| --- | --- | --- | --- | --- |
| PBA-01 | [HELIX-76](https://linear.app/helixnmbu/issue/HELIX-76/pba-01-establish-project-budget-contracts-and-safe-migration) | Establish project budget contracts and safe migration groundwork | F-01, F-04, F-13, F-15 | None |
| PBA-02 | [HELIX-78](https://linear.app/helixnmbu/issue/HELIX-78/pba-02-draft-project-budgets-and-complete-both-approval-stages) | Draft project budgets and complete both approval stages | F-01, F-02, F-04, F-05, F-14 | PBA-01 |
| PBA-03 | [HELIX-79](https://linear.app/helixnmbu/issue/HELIX-79/pba-03-revise-approved-budgets-with-reviewable-changes) | Revise approved budgets with reviewable changes | F-03, F-13, F-14 | PBA-02 |
| PBA-04 | [HELIX-77](https://linear.app/helixnmbu/issue/HELIX-77/pba-04-remove-the-nok-5000-rule-across-active-workflows) | Remove the NOK 5,000 rule across active workflows | F-06, F-09, F-14 | None |
| PBA-05 | [HELIX-80](https://linear.app/helixnmbu/issue/HELIX-80/pba-05-register-project-purchases-and-track-partial-completion) | Register project purchases and track partial completion | F-04, F-06, F-07, F-09, F-14 | PBA-02 |
| PBA-06 | [HELIX-81](https://linear.app/helixnmbu/issue/HELIX-81/pba-06-store-uploaded-invoices-in-shared-drive-with-recovery) | Store uploaded invoices in shared Drive with recovery | F-04, F-08, F-09, F-14 | PBA-05 |
| PBA-07 | [HELIX-82](https://linear.app/helixnmbu/issue/HELIX-82/pba-07-apply-and-release-awarded-funding-obligations) | Apply and release awarded funding obligations | F-04, F-10, F-11, F-14 | PBA-03 |
| PBA-08 | [HELIX-83](https://linear.app/helixnmbu/issue/HELIX-83/pba-08-show-purchased-budgets-and-consistent-financial-totals) | Show purchased budgets and consistent financial totals | F-05, F-09, F-12, F-13, F-14 | PBA-06, PBA-07 |
| PBA-09 | [HELIX-84](https://linear.app/helixnmbu/issue/HELIX-84/pba-09-rehearse-migration-and-verify-the-integrated-feature) | Rehearse migration and verify the integrated feature | F-01 through F-15 | PBA-04, PBA-08 |

Published parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking). All nine children have been created with native blockers; readback verification is recorded in publication.json. No implementation or service changes were made during preparation.

