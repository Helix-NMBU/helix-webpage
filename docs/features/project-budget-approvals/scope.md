# Project budgets, approvals and purchases

Feature: `project-budget-approvals`
Status: `ready-for-prepare`
Updated: 20 November 2026
Tracker: Linear, Helix member Platform, `P-HELIX-4`
Linear scope: [Project budgets, approvals and purchases](https://linear.app/helixnmbu/document/project-budgets-approvals-and-purchases-draft-scope-992741c7eff0), document `9dd33fe4-7434-4a84-a693-9fd815ef2deb`.
Related work: [Finance, HELIX-34](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing) and [Partner deals, HELIX-63](https://linear.app/helixnmbu/issue/HELIX-63/sponsor-pipeline-and-seasonal-partner-deals).

## Problem and outcome

Budgets need to belong to projects and pass through department approval before Finance can approve them. Project leads need a controlled way to revise approved budgets. Department leads and Finance need to register purchases against approved entries and find their invoices from the budget. Approved deal obligations must make the relevant entries mandatory purchases.

This scope covers the Finance workflow and its effects on project and department spaces, Business & Marketing, access checks and season financial summaries. The user explicitly requested scoping in Linear. That authorizes saving this scope there. Implementation tickets, application changes and deployment belong to later stages.

## Confirmed requirements

### Ownership and approval

- Every budget belongs to a project. Any assigned project lead can draft the budget and submit it to the department lead.
- Each budget has one designated responsible department, including when its project spans several departments. Approval goes to that department.
- The four stages are `Draft`, `Sent to approval (Department lead)`, `Sent to approval (Finance)` and `Approved`.
- Department approval sends the submitted budget to Finance. Finance cannot approve it before department approval.
- Only Head of Finance can give final Finance approval. That approval makes the budget approved and its entries available in `Register a purchase`.
- Finance has an overview of approved budgets and all submitted budgets awaiting approval, with the current approval stage visible. Department-pending budgets are read-only for Finance approval; they enter the actionable Finance queue only after department approval.

### Revisions

- A project lead, the responsible department lead or Finance can use `Request changes` on an approved budget. The project lead can then add, remove or edit entries and submit the revised budget through department approval and Finance approval again.
- The last approved version stays usable for purchase registration while a revision is drafted or awaits either approval. Proposed additions and changed amounts do not become available until the revised version completes both approvals.
- Both reviewers see the revised budget and a summary of its changes. The summary must identify added, removed and edited entries, their previous and proposed values, and the effect on the total.
- Approval must refer to the version reviewed. Editing after department approval cannot leave the previous department decision valid for the changed contents.
- Previous approvals, purchase allocations and invoice references must remain traceable when an entry changes or is removed from a later version.
- Preparation must specify how a reviewer returns a submission for correction within this four-stage workflow. No additional terminal rejection stage is requested.

### Purchase registration and invoice references

- Department leads and Finance can register purchases and select the approved budget entries purchased.
- Users upload invoices through `Register a purchase`, and the platform stores them automatically in Helix's shared Google Drive. The first version does not rely on pasting an existing Drive link.
- Retain the Drive file reference with the purchase and make its invoice link available from Finance budget details. Do not create public sharing links or widen Drive permissions as a side effect of registration.
- Failed or uncertain file transfer must produce a recoverable shared notification. Never claim an invoice is stored successfully until Drive confirms it. Preparation must specify how the actual expense and pending evidence remain recoverable together, without duplicate registrations or files.
- In Finance budget details, purchased entries are marked and link to their invoice. Multiple purchases must retain their separate references rather than overwrite an earlier invoice.
- An entry can be purchased across several registrations. Track partial purchases and provide an explicit completion marker when everything has been bought. Completing an entry is distinct from paying its invoice or spending exactly its planned amount.
- Purchase registration records an actual expense. It does not by itself mean an invoice has been paid.
- Remove the NOK 5,000 prior purchase-approval rule. Amount alone must not require a separate purchase request or approval. This removes the rule rather than increasing its threshold or replacing it with another limit.
- Remove threshold-dependent prompts, validations, new missing-approval flags, email warnings and current-policy export labels. Preserve historical decisions, requests, commitments and exception records without presenting the removed rule as a current requirement.
- Project budgets still require department approval followed by Finance approval. Removing the purchase threshold does not approve draft entries or erase budget limits.
- Record already-incurred costs even when they exceed the approved budget or have no approved entry, and flag them for Finance review. Review must preserve the original discrepancy and must not manufacture prior budget approval. This path must also work before a project's first budget approval; the current season-budget prerequisite must not suppress actual costs.

### Priorities and deal obligations

| Priority | Meaning |
| --- | --- |
| P0 | Earmarked, mandatory purchase because Helix has an obligation. |
| P1 | Highest ordinary priority. |
| P2 | Below P1. |
| P3 | Below P2. |
| P4 | Lowest ordinary priority. |

- Project leads select P1 through P4 when submitting budget entries. P0 is not a manual priority choice in that workflow.
- Business & Marketing can tie budget entries to an ongoing deal awaiting approval. The user clarified that these cards commonly represent funding applications, rather than only sponsor sales.
- Head of Finance can view the relevant funding application card, link existing budget entries or propose new entries, and identify the purchases required by that funding. This does not grant general Finance access to the entire private pipeline.
- Linked entries become P0 when the funding is awarded. Application submission, a generic Won move and funding reconciliation alone must not activate P0 without the award fact.
- New entries and increased amounts still require department and Finance budget approval. Awarding funding must not silently approve additional spending. P0 activation on an existing entry records the obligation without inventing new budget approval or cash receipt.
- A P0 obligation needs a traceable connection to its funding application or deal and the relevant approval. Only Head of Finance can release an obligation, and must record a reason. Project leads can propose changes but cannot remove the obligation through ordinary editing or deletion.
- Changed or cancelled funding does not silently release P0. Preserve obligation history and any purchases when Head of Finance records a release. Preparation must specify the post-release ordinary priority and avoid releasing an entry still covered by another active obligation.
- P0 concerns Helix's obligation to purchase. Existing restricted funding and its available balance are separate facts. A budget priority must not imply cash received or paid invoices.

## Users and permission boundaries

| User | Required behavior | Open boundary |
| --- | --- | --- |
| Assigned project lead | Any assigned lead can draft, edit and submit their project's budget and revisions, and request changes. | Preparation must define overlapping assignments without inventing a new segregation-of-duties policy. |
| Department lead | Review budgets assigned to their responsible department before Finance, request changes and register purchases. | Resolve existing department lead assignments and scoped project/department entry points. |
| Finance | View approved and submitted budgets, request changes, register purchases, review discrepancies and follow invoice links. | Finance membership alone does not grant final budget approval. |
| Head of Finance | Give final budget approval; inspect relevant funding application cards; link/propose obligated entries; release P0 with a reason. | Preparation must define how an award is recorded using existing deal/funding permissions. |
| Business & Marketing | Record funding applications/deals and link their obligations to budget entries. | Keep unrelated pipeline and negotiation data private. |

Use the existing project lead assignments and department membership model. An assigned project lead is distinct from the platform-wide Project Manager role. A generic authenticated session, partner OTP session or department label must not grant financial authority. The current Financials access requirement must be reconciled with project and department workflows, without giving project leads private organization-wide financial information.

## Concrete scenarios

1. A project lead creates a budget with a P1 item and a P3 item. Submission goes to the responsible department lead. Finance cannot approve it until the department lead approves that version.
2. Head of Finance approves the budget. A department lead registers a purchase against one entry and uploads its invoice. The platform stores the file in shared Drive. Finance sees the entry marked as purchased and can open the invoice.
3. A project lead, department lead or Finance requests changes. The project lead adds an item, edits an amount and removes another item. The department reviewer and then Finance see those differences. Purchasing can continue against the last approved version. A previously recorded purchase and invoice remain traceable.
4. Business & Marketing records a funding application in a pipeline card. Head of Finance inspects that card and identifies its required purchases. The linked entries become P0 on funding award, while any new entries or increased amounts still pass both budget approvals. Retries must not duplicate obligations.
5. A reviewer opens one version while a lead changes it. The stale approval fails without overwriting the newer version or losing the user's work. Recovery uses the shared app notifications.
6. An authorized department lead registers an NOK 8,000 purchase against its approved budget entry and uploads its invoice. The platform does not ask for separate approval because the amount exceeds NOK 5,000.
7. An entry is fulfilled in two orders. Each registration retains its actual cost and invoice. The first remains partial; the user explicitly marks the entry complete after the final purchase.
8. A purchase exceeds its approved amount, or precedes the first budget approval. The actual cost is recorded with a Finance review flag. It does not become approved retrospectively.
9. Funding conditions change. A project lead cannot remove its P0 obligation. Head of Finance records a release with a reason; the original award, obligation and purchases remain traceable.

## Existing behavior verified in the working tree

- `db/migrations/011_finance_core.sql` gives `finance.budgets` a unique season, no project link and only `draft`/`approved` statuses. Entries belong to systems and the season budget. Current priorities are P1 through P4 and `EM`, with EM requiring a funding-part link.
- `api/_lib/finance-budgets.ts` implements one-step create/approve and direct item changes. `src/features/Finance/access.ts` gives budget creation, approval and protected edits to Head of Finance, and draft item editing to Finance.
- `api/_lib/finance-purchases.ts`, especially `validationContext`, requires the season budget to be approved. This dependency must become project/version aware. Existing purchases already have item allocations and invoice/payment data.
- `api/_lib/finance-storage.ts` and `src/features/Finance/PurchaseRegister.tsx` implement private object storage and authorized document downloads. Automatic storage of uploaded invoices in shared Drive would be a new integration, not existing functionality verified here.
- `src/features/ProjectManagement/types.ts` and `api/_lib/project-management-validation.ts` support multiple project leads and departments. `api/_lib/project-management-service.ts` reads season department leads separately.
- `api/_lib/finance-service.ts` and `src/features/MemberPlatform/FinanceAccess.tsx` enforce Financials access. Existing UI/access arrangements do not already grant this proposed project-budget workflow.
- `src/features/Finance/finance-calculations.ts` makes EM scenario eligibility depend on funding eligibility. Replacing EM with mandatory P0 would affect scenario calculations as well as labels.
- `docs/features/partner-deals/spec.md` distinguishes Won confirmation, cash financing and Marketing deliverables. `db/migrations/043_partner_finance_review.sql` and later review migrations concern funding reconciliation. Those approvals cannot be assumed to approve purchase obligations.
- The earlier finance specification excludes budget reopening/versioning and includes separate prior purchase approval strictly above NOK 5,000. This new scope supersedes those choices by adding budget revisions and removing the NOK 5,000 rule.
- Threshold behavior exists in `src/features/Finance/purchase-domain.ts`, `api/_lib/finance-purchases.ts`, `api/_lib/finance-service.ts`, `api/_lib/finance-mail.ts`, `api/_lib/finance-export.ts` and database registration functions. Preparation must cover all active paths rather than only change the UI. Existing purchase-request commitments require historical compatibility; deleting financial history is not authorized.

These observations come from the current working tree, which contains unrelated changes. They are not proof of the deployed application's current behavior. Preserve unrelated work.

## Confirmed interview decisions

- D1, 19 November 2026: Any assigned project lead can draft the budget. One designated department is responsible for its first approval. The user selected the recommended answer to Q1.
- D2, 19 November 2026: A project lead, department lead or Finance can request changes. Purchases can continue against the previous approved version during reapproval. The user selected the recommended answer to Q2.
- D3, 19 November 2026: Funding applications are represented by pipeline cards. The user accepted the proposed Head of Finance workflow and selected P0 activation when funding is awarded. Head of Finance can view the relevant card, link existing entries or propose new ones. New entries and increased amounts still need both budget approvals.
- D4, 19 November 2026: The user explicitly said, "We're going to scratch the 5000 rule. Remove it". Remove the threshold rule and its active enforcement and messaging; do not replace it with another amount limit. Budget approval remains required.
- D5, 19 November 2026: The user selected upload through `Register a purchase` rather than existing Drive links or both input methods. D7 subsequently confirms shared Drive as the destination.
- D6, 19 November 2026: Only Head of Finance gives final Finance approval for project budgets.
- D7, 19 November 2026: Uploaded invoices are stored automatically in Helix's shared Google Drive. This is the user's explicit invoice-storage exception to the repository's general Neon object-storage convention. Neon remains the application database and authentication provider.
- D8, 19 November 2026: Already-incurred purchases outside the approved budget are recorded as actual costs and flagged for Finance review. Registration must not wait for budget reapproval.
- D9, 19 November 2026: Allow partial purchases across several registrations, with an explicit marker when the budget entry is completely purchased. Keep each purchase's invoice.
- D10, 19 November 2026: Only Head of Finance can release P0, and must record a reason when funding conditions change.

## Preparation details and operational inputs

Revision 1 was approved against D1 through D10. The department-submission clarification below adds confirmed decisions D11 through D16. Its complete revision 2 amendment was approved and published on 20 November 2026. The following details belong in the reviewable Prepare specification; they are not additional user decisions already approved in this chat.

- Use project and department entry points for scoped drafting and first approval, and Finance for the overview/final queue. Exact navigation, filters, read access, role-to-assignment resolution, return-for-correction controls, reasons and approval notifications are preparation details. Do not give a project lead organization-wide Financials access merely to use their own budget.
- Work with one current budget for a project in a season and its revisions as the preparation default inferred from the requested singular project budget. If multiple independent budgets per project are needed, bring that scope change back to the user. Define stable entry identity, one pending revision, approved snapshots, comparison baselines, concurrency and edits after submission in the specification.
- Specify partial/completed states, quantities and actual amounts using the existing purchase-line model. Completion must be explicit; spending the planned amount does not automatically prove that everything was bought. Define reopening/correcting a completion marker, revision removal of purchased entries and void effects without erasing history.
- Define award recording and Head of Finance's limited card access. A funding application is not automatically a sponsor sale, and an award is not cash receipt. Preserve restricted-funding calculations separately from mandatory P0 need. Specify the previous ordinary priority and multiple-obligation handling when releasing P0. Project revisions cannot bypass the release permission.
- Inventory active purchase requests/commitments before removing threshold enforcement. Keep historical requests, decisions and balances usable. Retiring or retaining optional request UI is a preparation choice to present explicitly; this scope authorizes removing the NOK 5,000 rule, not erasing all procurement records.
- Choose the Drive upload/auth integration, file verification, stable references, folders, transfer recovery, duplicate prevention and retrieval/export compatibility. Keep existing files accessible. This scope adds automatic invoice storage in Drive; it does not migrate historical attachments or relocate all platform object storage.
- Before release, identify the authorized shared Drive/folder and service identity, verify its restricted access, and agree any folder organization. These are operational inputs, not authorization to modify Drive during Scope.
- Before release, inventory current season budgets and map existing entries to real projects without changing their references, actual allocations or invoices. Do not fabricate a project, discard unmatched entries or require legacy Supabase imports. Exact mapping is operational input to the migration plan, not a blocker to preparing that plan.
- Reuse the existing system/department hierarchy where useful, and specify approved project/season rollups and P0 treatment in financial scenarios. Keep pending revision totals separate and never double count actuals. Present any changes beyond the agreed workflows for review.

There are no accepted assumptions beyond the explicit decisions above. Preparation defaults are identified as such and must appear in its complete reviewable plan. A new governance or data-deletion decision requires user review rather than being inferred from scope readiness.

## Constraints and exclusions

- English interfaces, existing shadcn/ui theme and shared notifications. Reuse shared controls first, then the UI SDK's smallest suitable behavior. Verify keyboard, pointer, focus and dismissal behavior during implementation.
- Neon remains the application database and authentication provider. Store new uploaded invoices automatically in shared Drive under D7; this specific user decision takes precedence over the general Neon object-storage convention. No public invoice sharing, broader storage migration or legacy Supabase imports are authorized.
- Keep actual cost, budget approval, deal obligation, funding and payment distinct. Remove the amount-triggered purchase-approval policy under D4. Preserve historical approvals/commitments and existing invoice-payment, reimbursement, void and financial audit behavior.
- Use exact money, server-side permissions, revision checks and duplicate-safe submissions. No destructive removal of purchased records or their evidence.
- Season totals must count each effective approved entry once across project budgets. Keep the previous approved version effective during revision, as agreed in D2. Draft and pending changes must not enter approved totals or duplicate actuals.
- No implementation, database writes, live financial data changes, Drive writes, email sending, deployment, branch creation or ticket breakdown in this stage.
- Local validation uses untracked environment files and dedicated loopback test mode. Keep source and generated deployment functions at most 11. Publishing the application requires separate authorization.
- General accounting, bank payments, OCR, invoice generation, CRM synchronization and a general permissions redesign are outside this scope.

## Helper findings and handoff

Scope used Define to distinguish assigned project leads, project budgets, revisions and purchase obligations. Agreed terms are recorded in `CONTEXT.md`. Unslop was applied to interview questions and this scope. No external research, prototype or advisor questionnaire was needed to settle the product workflow. [ADR 0001](../../adr/0001-store-finance-invoices-in-shared-drive.md) records the deliberate shared Drive invoice-storage exception and its boundaries.

The user confirmed D1 through D10 in the interview, then requested Prepare and explicitly approved specification revision 1 and its nine-task plan on 19 November 2026 by selecting "Approve and publish in Linear". The approved [specification](spec.md) and [ticket plan](tickets.md) are now published as [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking) and nine children, HELIX-76 through HELIX-84, with verified native blockers. Publication details, the exact approval and approved draft hashes are in publication.json.

First eligible work is HELIX-76, contracts and migration groundwork, and HELIX-77, removing the NOK 5,000 rule. Continue with `$deliver HELIX-75` when implementation is requested. Publication approval has not started implementation and does not authorize release; no application, live database or Drive changes were made in Prepare.


## Department submission clarification, 20 November 2026

The user clarified that Finance receives the whole allocated department budget, grouped by project. Each project shows its entries and subtotal, and the department shows the combined total. New, changed and removed entries must be easy to distinguish. Removed entries remain in the comparison rather than disappearing. Before submission, the department lead sees all relevant projects, including those without a budget or still drafting, so they can follow up with project leads.

- D11: Finance approves all included project changes together as one fixed department package. The user explicitly chose this over separate project decisions in a grouped view.
- D12: A department lead may submit while some projects have no budget or are still drafting. Show readiness for every project and its last approved amount where available. Clearly identify which changes are included.
- D13: Finance review groups entries under their project, with project subtotals, a department total and explicit New, Changed and Removed labels with previous/proposed values.
- D14: The department lead's pre-submission view includes projects that have not started a budget, rather than listing only existing budget headers.

- D15: The full project budget counts under its one responsible budget department, including entries for systems used by another department. The user explicitly chose this over splitting by system department. A project contributes to one department submission and is never counted twice.

The current implementation groups canonical Finance aggregates by system department. PBA-10 must change this attribution for project-owned entries while preserving physical system identity and historical purchases. Projects with no selected budget department remain explicitly unallocated in readiness views until their project lead chooses the responsible department; a caller-dependent scope fallback is not financial ownership.

The draft amendment is in `department-submission-amendment.md`. Existing PBA-08 canonical facts, historical evidence and refresh work can continue. The new department package lifecycle and final feature acceptance must use the amended approved contract. Revision 1 implementation evidence remains historical evidence and does not prove the new package behavior.

- D16, 20 November 2026: The user directly requested an allocated-budget widget on each department homepage, with an at-a-glance project breakdown for people within the department. It uses the same approved responsible-department allocation. This explicit addition is included in PBA-10; no further product decision is needed.
