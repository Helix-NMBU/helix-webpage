# Helix Finance functional migration scope

Prepared 26 October 2026. Feature identifier: `helix-finance-migration`.

Source repository: `oskarrandel/helix-finance`.
Inspected commit: `6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9`, dated 14 October 2026.

Navigation:

- [Baseline inventory](#3-baseline-capability-inventory) and [page mapping](#4-destination-information-architecture).
- [Users and permissions](#5-users-and-permission-model).
- [Overview](#7-overview-page-requirements), [Purchases](#8-purchases-page-requirements), [Budgets](#9-budgets-page-requirements), and [Financing](#10-financing-page-requirements).
- [Calculations](#11-calculations-to-preserve), [data dictionary](#12-logical-data-model-and-field-inventory), and [operations](#13-existing-application-operations-and-destination-contracts).
- [Shared behavior](#14-shared-behavior-and-technical-adaptations) and [data migration](#15-data-migration-and-cutover-scope).
- [Known differences](#16-differences-limitations-and-decisions-that-must-remain-visible), [future features](#17-documented-future-functionality-outside-baseline), and [exclusions](#18-explicit-exclusions).
- [Acceptance criteria](#19-acceptance-criteria-for-baseline-parity), [implementation order](#20-suggested-implementation-sequence), and [open decisions](#21-decisions-to-resolve-in-the-destination-repository).
- [Destination handoff prompt](#22-handoff-instruction-for-the-destination-repo) and [source evidence](#23-source-map-and-verification-record).

## 1. Purpose, authority, and how to use this document

Move the finance functionality of the source application into an existing internal platform for Helix members. The platform already has a Finance sidebar entry. The confirmed destination pages are Overview, Purchases, Budgets, and Financing. Rebuild the interface using the destination platform's design and components.

This document describes the application independently of its current HTML, layout, Google Apps Script hosting, and spreadsheet storage. It provides the behavior, permissions, calculations, workflows, data, integration requirements, limitations, and acceptance criteria needed to implement a replacement.

The destination repository was not supplied or inspected. Route paths, framework choices, database choices, user-role integration, and storage providers below are recommendations or open decisions. They are not descriptions of that repository.

The inventory is complete for the inspected source snapshot. The migration proposal needs reconciliation with the destination platform before implementation. The user has confirmed the four-page structure and a new UI, but has not approved every recommendation or future feature in this document.

Use these evidence categories throughout:

| Category | Meaning | Treatment in the migration |
|---|---|---|
| Implemented | Supported by source code, with tests where identified | Baseline functionality to preserve |
| Documented only | A business rule, schema field, workflow, or roadmap item exists, but the complete working flow is absent | Keep outside baseline unless separately selected |
| Migration recommendation | A proposed adaptation or repair for the destination platform | Review as a deliberate change |
| Open decision | Requires destination context or a product decision | Resolve before implementing the affected behavior |

The README and implementation checklist lag behind the code. They are useful context, but they cannot establish whether a feature works. The current code and tests establish implemented behavior. `BUSINESS_RULES.md` establishes intended rules. Differences between them are recorded explicitly in section 16.

No production Google Sheet, Drive folder, deployment, email history, or live finance data was inspected. The local browser preview uses fictional, in-memory data created outside the repository. Its budgets, people, suppliers, funding amounts, and balances are not migration input.

## 2. What the application does

The application tracks a season's planned spending, recorded spending, and expected or received financing. It connects each purchase line to a budget item within a Helix department and system. Receipts and invoices provide supporting documents. Earmarked funding pays for specific budget items and has its own usage and deadline tracking.

It answers these operational questions:

1. How much has each department and system budgeted and spent?
2. Which spending is over budget or has no ordinary budget item?
3. Can financing cover the required priorities under conservative, realistic, and optimistic scenarios?
4. Which member outlays still need reimbursement, and which invoices still need payment?
5. How much earmarked money has been used within its deadline, and how much is left to return?
6. Who changed an amount, status, priority, funding record, or payment marker?

Recorded spending is a purchase-backed cost measure. It is not a bank balance or a cash-flow forecast. An unpaid registered invoice already contributes to actual spending. Marking an invoice paid or an outlay reimbursed changes its payment state, not its recorded cost.

The source also describes a later procurement approval process and a later engineering/cost-event system. Those complete workflows are not implemented in this snapshot.

## 3. Baseline capability inventory

| Capability | Source status | Destination responsibility |
|---|---|---|
| Current-season context | Implemented, configured through Settings | Shared across Finance |
| Department/system/item budget overview | Implemented | Overview and Budgets |
| Planned, spent, difference, budget usage | Implemented | Overview and Budgets |
| Show unbudgeted spending separately | Implemented | Overview and Budgets |
| Financing scenarios | Implemented | Overview for permitted users; calculation shared with Financing |
| Earmarked parts, exact use, deadlines, return amounts | Implemented | Overview, Financing, and budget-item links |
| Register a receipt/invoice purchase with several lines/files | Implemented | Purchases, with an Overview shortcut |
| Outlay refund details | Implemented, finance visibility only | Purchases |
| All-purchase register | Implemented, finance visibility only | Purchases |
| Filter for unpaid invoices/outlays | Implemented | Purchases |
| Mark/undo reimbursement and invoice payment | Implemented | Purchases |
| Void a purchase with a reason | Implemented | Purchases |
| Finance notification on registration | Implemented through MailApp | Server notification integration |
| Derived purchase spreadsheet with attachment links | Implemented | Optional retained integration; preserve access to its useful information |
| Create and approve a season budget | Implemented, Head of Finance only | Budgets |
| Add/edit/cancel/restore budget items | Implemented with approval-dependent permissions | Budgets |
| Department CSV preview/import/re-import | Implemented | Budgets |
| Add/edit/delete/restore financing | Implemented | Financing |
| Add/edit earmarked parts of financing | Implemented | Financing |
| Delete an earmarked part | No dedicated operation | Do not invent a destructive delete workflow |
| Audit records and unique references | Implemented | Shared backend |
| Refresh after changes by other users | Implemented | Shared frontend data behavior |
| Request, approve, reject a large purchase | Documented only as a complete workflow | Optional later scope |
| Open commitments, remaining after commitments, forecast | Documented formulas; complete services absent | Optional later scope |
| Reallocate an existing line or split it between items | Data model supports allocations; editing workflow absent | Optional later scope |
| Correct a registered amount or return a purchase to the submitter | Documented only | Optional later scope |
| Supplier master-data management | Schema only; registration uses supplier text | Optional later scope |
| Grant report export | Documented only | Optional later scope |
| Close a season and enforce read-only records | Documented only as a complete workflow | Migration decision and recommended safeguard |
| Assembly, part, BOM, assets, manufacturing logs, CCBOM | Documented future phases | Outside baseline |

## 4. Destination information architecture

The page names below are confirmed. Route strings are suggested examples only.

| Page | Suggested route | Responsibility |
|---|---|---|
| Overview | `/finance/overview` | Current-season summary, department drill-down, earmarked usage, financing scenarios for permitted users, register-purchase shortcut |
| Purchases | `/finance/purchases` | Purchase submission for members; finance register, payment work, attachments, and voiding for finance |
| Budgets | `/finance/budgets` | Read-only hierarchy for members; budget lifecycle, item maintenance, and CSV imports for finance |
| Financing | `/finance/financing` | Financing sources and earmarked parts, restricted to Business and finance |

The source has five tabs because registration and the finance purchase register are separate. Combining them under Purchases is a deliberate mapping to the user's four-page structure. Preserve their separate permissions. Members should get the submission entry point on Purchases without receiving the finance register's data.

Suggested page behavior:

- Opening Finance defaults to Overview, unless the destination platform has an established routing convention.
- The current season is visible on each page.
- An Overview department link opens or filters the corresponding Budgets department.
- A register-purchase action opens the same submission workflow whether invoked from Overview or Purchases.
- Financing is hidden from ordinary members, and direct route/API access is denied.
- Members retain access to the Purchases submission page even though they cannot list purchases.
- Budget approval and purchase approval are different capabilities. Only budget approval exists in the baseline.

Page layouts, cards, tables, dialogs, tabs inside a page, charts, colors, typography, and component choices belong to the new design. Preserve the meaning of warnings, amounts, and role distinctions. The old yellow earmark rows and red overdue displays express states that the replacement must communicate accessibly; their exact styling is not a dependency.

## 5. Users and permission model

### 5.1 Source identity behavior

The source authenticates the active Google Workspace account and accepts addresses ending in `@helixnmbu.no`. It normalizes email case. An active Person record supplies the user's name and role. An in-domain user with no Person record, or with `active = false`, falls back to `member`.

This fallback removes elevated permissions but does not suspend platform access or purchase submission. Do not interpret the source's Person.active field as an implemented ban on refunds or membership.

`system_lead` has no extra implemented finance capabilities beyond member. The future purchase-request workflow mentions system leads, but their approval/request capabilities are not implemented.

### 5.2 Capability matrix

| Capability | Member / system lead | Business | Finance | Head of Finance |
|---|---|---|---|---|
| View public budget overview and hierarchy | Yes | Yes | Yes | Yes |
| See public earmark purpose, amount, usage, deadline | Yes | Yes | Yes | Yes |
| Register purchases | Yes | Yes | Yes | Yes |
| Receive submission reference and warnings | Yes | Yes | Yes | Yes |
| Browse purchase register, including own records | No | No | Yes | Yes |
| View purchase attachments and private refund number | No | No | Yes | Yes |
| Mark/undo payment or reimbursement | No | No | Yes | Yes |
| Void a purchase with reason | No | No | Yes | Yes |
| See scenarios, funding sources, and earmark conditions | No | Yes | Yes | Yes |
| Add/edit/delete/restore financing | No | Yes | Yes | Yes |
| Add/edit earmarked parts | No | Yes | Yes | Yes |
| Create season budget | No | No | No | Yes |
| Approve draft budget | No | No | No | Yes |
| Add/edit/cancel/restore draft budget items | No | No | Yes | Yes |
| Change approved item amount/priority/earmark; add/cancel/restore items | No | No | No | Yes, with reason |
| Edit other allowed fields of an approved item | No | No | Yes | Yes |
| Preview/import a department budget | No | No | Yes, subject to each change's permissions | Yes, subject to reason rules |
| Retry/rebuild derived purchase output | No | No | Yes | Yes |
| Receive automatic finance registration emails | No | No | Yes, when active | Yes, when active |

Business can submit purchases as a member, but its funding privileges do not expose purchase records or finance email notifications. Its permissions include earmark conditions even where older document comments say "finance only".

### 5.3 Backend data boundaries

Permissions must apply before data leaves the server. Hiding controls is insufficient.

Ordinary member read responses contain the public budget hierarchy and public earmark summaries. They exclude the purchase list entirely, including the submitter's own historical purchases. They also exclude funding rows, funding sources, scenario results, earmark conditions, refund details, finance-only editing data, and finance integration error details.

Business read responses add financing, scenarios, funding-owner information, earmark sources and conditions, and related configuration. They still exclude purchases, private refund data, and budget editing data.

Finance responses include the purchase register, attachment links, refund details, full budget items, funding, scenarios, and integration status.

The platform may use its existing membership and permissions model instead of a separate Person table. Map these capabilities explicitly. A generic platform administrator should not automatically acquire finance access unless that mapping is approved.

## 6. Domain concepts and relationships

| Term | Meaning |
|---|---|
| Season | The financial/planning period, such as S27 for 2026/27 |
| Department | A Helix organizational group, such as Mekanikk or Elektronikk |
| System | A budgeting/spending area inside a department, such as FR or LV |
| Budget | The single draft or approved budget for a season |
| Budget item | A planned expenditure within one system |
| Purchase | One procurement event with a supplier, buyer, payment method, date, lines, and documents |
| Purchase line | A named thing bought, its quantity, and its total line cost |
| Allocation | The amount of a purchase line charged to a budget item |
| Document | A supporting receipt or invoice and its stored file link |
| Funding | Expected, secured, or received cash financing from a source |
| Earmarked part | A restricted portion of one funding source, with a purpose, exact amount, and optional spending deadline |
| Unallocated item | A system-generated, zero-plan budget item that holds spending explicitly marked outside the budget |
| Actual / spent | Registered purchase allocations; includes unpaid invoices |
| Difference | Planned amount minus actual spending |
| Audit entry | Who changed which entity field, when, from what to what, and why where required |

Relationships to retain:

```text
Season has one Budget and many Funding records and Purchases.
Department has many Systems.
System has many BudgetItems.
Budget has many BudgetItems.
Purchase has many PurchaseLines and Documents.
PurchaseLine has many Allocations in the data model.
Each Allocation must reference a BudgetItem.
Funding has many FundingEarmarks.
A BudgetItem with priority EM references one FundingEarmark.
An earmarked part can pay for several non-cancelled items, all in one System.
```

A budget item is not an engineering part. A line description names what was bought, such as "Muffler", while its budget item could be "Eksos". Do not collapse these fields.

The baseline registration creates exactly one allocation for the full amount of each line. Multiple allocations per line and optional part/assembly links exist in the model for later work, but the source has no user-facing split/reallocation operation.

## 7. Overview page requirements

### 7.1 Season and budget state

Show the selected/current season and whether its budget is absent, draft, or approved. For an approved budget, the source displays the approval date. Keep this context available without requiring users to enter Budgets.

If no budget exists, finance sees a clear warning. The Head of Finance can create it. Purchase registration must explain that it cannot continue until a budget exists. Funding can exist before budget creation.

### 7.2 Department summary

For each configured dashboard department, present:

- Department name and a way to open its budget detail.
- Total planned amount excluding cancelled items.
- Total actual spending from registered purchase allocations.
- Difference between planned and actual.
- Share of the budget spent, with an undefined state when planned is zero.
- Unbudgeted spending separately when nonzero, while including it in total spending.
- Earmarked amounts by system and how much of them has been used, when applicable.

`dashboard_departments` controls which departments appear on Overview and their order. If absent, use all active departments. This preference affects presentation, not permissions or which valid departments can be selected when registering a purchase.

The source includes active systems even when their values are zero. It also retains inactive systems in a department's overview if they have planned money, spending, or earmarked money. Systems are ordered by name using Norwegian collation. Active departments are the input to the ordinary overview; migration reconciliation must account for historical records attached to inactive departments.

### 7.3 Financing scenarios

Only Business, Finance, and the Head of Finance see the scenarios. Show the three scenario names, the priority groups they must cover, total eligible financing, total need, and a shortfall when positive. Provide an accessible covered/shortfall state. A shortfall is advisory and never blocks saving a purchase, budget, or funding agreement.

The source labels are Nå, Realistisk, and Optimistisk. English equivalents may be used if the destination platform's language is English. Preserve the scenario definitions in section 11.

### 7.4 Earmarked funds

All members can see public summaries of earmarked parts belonging to current-season funding with status `secured` or `received`.

Group the parts by their linked system. For each part show purpose, amount, eligible amount used, amount left, deadline if present, and amount that must be returned after the deadline. For parts with no non-cancelled linked items, provide an unassigned group rather than dropping them.

Ordinary members must not receive the funding source or private condition text. Business and finance can inspect that information through Financing and the permitted budget annotations.

## 8. Purchases page requirements

### 8.1 Two roles for one page

Purchases is the member submission entry point and the finance work queue. Members and Business see registration and submission confirmation. Finance also sees the register and payment/void actions. Listing personal purchase history would be a new feature and permission change.

### 8.2 Purchase submission fields

| Field | Required behavior and validation |
|---|---|
| Buyer name | Required, nonblank; defaults to the current user's name where available |
| Supplier name | Required, nonblank free text; no supplier-directory dependency |
| Purchase date | Required valid ISO date, not after today's date; defaults to today |
| Payment method | `team_account`, `outlay`, or `invoice` |
| Justification | Required, trimmed length at least 10 characters; describe what and why |
| Refund method | Required for outlays; `account` or `phone` |
| Refund destination | Outlays only; account must contain 11 digits, phone 8 digits after removing spaces/periods for validation |
| Document type | `receipt` or `invoice` |
| Due date | Required valid date when document type is invoice |
| Invoice/document number | Optional; invoice number is exposed in the current form |
| Files | At least 1 and at most 15 files; file rules in section 8.5 |
| Lines | At least one line; no specific implemented maximum |

Non-outlay submissions discard refund fields on the server. Preserve this rule so a hidden field does not accidentally store a private number on a team-account purchase.

The current form defaults to team account, receipt, refund-to-account, today's date, and one blank line with quantity 1. These are convenience defaults; they do not replace explicit validation.

### 8.3 Purchase line fields and selection

Each line contains department selection, system selection, budget-item selection or "not in the budget", description, quantity, and line amount in NOK including VAT.

The department filters systems. The system filters eligible budget items. Changing department clears system and item. Changing system clears item. The source sends the system and item to the backend, which derives the department through the system relationship.

Server rules:

1. The system must exist and be active.
2. An ordinary item must belong to the current budget and selected system, and must not be cancelled.
3. A missing item selection is invalid. It is different from explicitly choosing "not in the budget".
4. The explicit outside-budget choice resolves to that system's unallocated item.
5. The description must be nonblank even for an unbudgeted line.
6. Quantity must be numeric, finite, and greater than zero. Missing quantity becomes 1.
7. Line amount must be numeric, finite, and greater than zero.

Quantity is descriptive. `amount_nok` is the whole line's total, not a unit price. A quantity of 3 and amount 900 means 900 NOK total, not 2,700 NOK. The new UI must label this unambiguously.

Users can add and remove lines while retaining at least one usable line. Several lines can use the same budget item. Their combined amount must be used for the budget warning.

### 8.4 One-step submission and resulting records

The member has one final submit action. An implementation can retain internal preflight/upload/save calls without requiring a separate confirmation page.

Implemented sequence:

1. Server checks identity, budget existence, purchase fields, line relationships, file metadata, amounts, budget match, and limit warning.
2. If validation fails, show field and line errors and upload nothing through the normal form flow.
3. Upload valid files individually into staging. Show progress and disable duplicate submission while busy.
4. Final registration verifies that each supplied file still exists in staging and repeats validation using actual stored file metadata.
5. Reject if the submitter has already registered 20 purchases in the preceding hour.
6. In the serialized write section, ensure any necessary unallocated items, reserve the reference, move files, and create the Purchase, lines, allocations, documents, and creation audit entry.
7. Create Purchase with `status = registered`, current season, authenticated requester, and `urgent = false`.
8. Store lines as NOK, `fx_rate = 1`, `amount_original = amount_nok`, and unit `stk`.
9. Create one full-value allocation per line.
10. Create one Document record per uploaded file, using the submission's shared document type, number, purchase date, and invoice due date. Initial `paid` is false.
11. Recompute financing summaries and attempt to rebuild the derived purchase spreadsheet.
12. Attempt the finance notification after saving.
13. Return reference, total, line budget information, and warnings. Clear the submitted form and show a persistent confirmation with reference and warnings plus an action for another purchase.

The 20-per-hour check counts saved records by requester and creation timestamp, including subsequently voided purchases. It is not a limit on lines or files and does not rate-limit every API call. The source evaluates it before obtaining the write lock, so exact concurrent enforcement needs improvement in the destination.

The source has serialized writes but no database rollback across Sheets and Drive. "Nothing saved on invalid input" is supported by validation tests; it is not a guarantee against partial records after an unexpected storage failure. The destination should use transactions and recoverable attachment finalization. See section 14.

### 8.5 Attachments

- Accepted extensions are jpg, jpeg, png, heic, heif, and pdf.
- Accepted MIME types are image/jpeg, image/png, image/heic, image/heif, and application/pdf.
- The current allow rule accepts a recognized extension OR a recognized MIME type. This is not content inspection.
- Maximum file size is 10 × 1024 × 1024 bytes per file. The upload API checks estimated decoded base64 size; final registration checks stored size.
- Maximum 15 attachments per purchase.
- The current form allows adding files in several selections and removing a selected file before submission.
- Preserve the file's uploaded-name metadata. The source sanitizes path-unsafe characters before staging, so `original_name` is the staged original name rather than a guaranteed byte-exact filename.
- In Drive, final files live under `{season}/{YYYY-MM Month}/{reference} {supplier}/` and are named `{reference} {Kvittering|Faktura} {n}.{ext}`.
- The month comes from purchase date. The reference year comes from registration date. These can differ.
- Files inherit the restricted finance archive's permissions. Membership alone must not grant attachment access.

The destination can replace Drive with its storage integration. Retain a durable purchase/document association, finance-only retrieval, useful original filenames, and stable historical references. Folder names are an operational convention, not a reason to depend on Google Drive.

Abandoned-upload cleanup, upload-to-user ownership checks, deduplication, content checks, and retry idempotency are not complete source features. They are migration safeguards to design explicitly.

### 8.6 Budget warnings and approval threshold

For each item, calculate current registered spending plus all lines of the pending purchase assigned to that item. Compare that amount with the item's plan.

| Result | Meaning | Submission effect |
|---|---|---|
| Within | Post-purchase spending is at or below plan | Save |
| Over | Post-purchase spending exceeds plan; report excess | Warn and save |
| Unbudgeted | Line uses the system's unallocated item | Warn and save |
| Above approval limit | Purchase total is strictly greater than the configured limit | Warn and save under the source's interim policy |

The default threshold is 5,000 NOK including VAT. A positive numeric `approval_limit` setting overrides it. Exactly 5,000 is not above a 5,000 limit. The warning is not an approval record and must not be labeled approved.

The policy says large purchases should be approved beforehand. The complete request/approval flow is missing, so the implemented interim behavior registers them and alerts finance. Adding a blocking approval gate is a policy change, not a faithful migration.

Deduplicate over-budget messages per item. Multiple unbudgeted lines can each identify their system. The source confirmation and finance email include warnings.

### 8.7 Finance purchase register

Finance can read the register with:

- Reference and purchase date.
- Supplier, justification, buyer, and authenticated requester.
- Purchase status and total.
- Each line's description, quantity, amount, system name, and budget-item name or unbudgeted marker.
- Payment method and payment/reimbursement status.
- Outlay refund method and destination, finance only.
- Invoice due date and paid date.
- Links to all supporting documents.
- Void action for registered records.

The source register sorts references descending and reads purchases across seasons. The generated purchase spreadsheet instead filters to current season and sorts purchase date descending, then reference. A season-filtered destination register is recommended, but this difference must be resolved explicitly rather than assuming the old code was consistent.

The only implemented register filter is "unpaid only", with a count. Search, pagination, date filters, department filters, and CSV export may suit the new UI, but are additions, not existing requirements established by this source.

### 8.8 Unpaid work and payment tracking

A purchase is in the current unpaid predicate when it is registered and either:

```text
payment_method is outlay AND refund_paid_date is empty
OR
first document type is invoice AND first document paid is false
```

For outlays, finance can mark reimbursed. Set `refund_paid_date` to today and audit the change. Undo clears the date and audits it. Reject wrong purchase types, non-registered purchases, and repeated marks/undo operations that do not change state.

For invoices, finance can mark a Document paid. Set `paid = true` and `paid_date = today`; undo sets false and clears the date. Reject non-invoice documents and repeated marks/undo operations. The source audits the paid boolean; the related date is stored as part of that operation.

These actions record an external payment. They do not transfer money, initiate bank payments, calculate reimbursement amounts, or send payment instructions to a bank.

The current table uses the first Document to represent invoice state. Other files have separate Document records whose paid flags are not automatically synchronized. Resolve how multiple files representing one invoice should behave in the destination. The new register should not accidentally display an invoice as settled while ignoring separate unpaid obligations.

The source permits payment method and document type to be chosen independently. Outlay presentation takes precedence in the payment cell. Decide whether to preserve these combinations or enforce a cleaner relationship.

### 8.9 Voiding

Finance can void a mistaken registration with a nonblank reason. Keep the purchase, lines, allocations, documents, and reference. Write an audit entry for the status change. Recompute actual spending and scenarios, and refresh the purchase output. A voided purchase stops contributing to actual spending and leaves the unpaid queue.

There is no user-facing permanent deletion or unvoid operation. There is also no complete edit/reallocate/return-to-member workflow. Preserve the implemented void action without presenting those absent operations as available.

### 8.10 Notifications and derived purchase output

Every successful registration attempts one summary email addressed to all active finance and Head of Finance records. Business does not receive it through this role-based recipient list.

Email content includes reference, buyer, supplier, date, payment type, document type, due date for invoices, justification, quantities and line amounts, budget status, total, warnings, document links, and an app link when available. Include the unbudgeted/over-budget context. Never include refund account or phone numbers.

Prefix the subject for an invoice with the unpaid-invoice marker, and for a total above the threshold with the above-limit marker. The above-limit label should use the configured threshold rather than assuming it always stays 5,000.

An email failure must not undo a saved purchase. The source logs that failure but has no durable retry queue or general delivery-status UI.

The derived purchase spreadsheet has one row per purchase with date, reference, supplier, justification, item descriptions/quantities, buyer, amount, system, budget item, budget status, document type, due date, paid/refunded state, above-limit flag, purchase status, and attachment links. It excludes private refund numbers. Its budget status reflects the current aggregate budget situation, not an immutable at-submission verdict. "Unbudgeted" takes precedence over "over budget", which takes precedence over "within".

Spreadsheet rebuild failure is nonfatal. Store/show a finance-visible error and provide retry. A successful rebuild clears the error. The current error is cached for up to six hours; a destination integration should use durable status if continued operation depends on it.

Whether to retain this external spreadsheet is an open integration decision. If removed, the platform must provide the finance team's equivalent reference and attachment information and a reliable archival/export approach.

## 9. Budgets page requirements

### 9.1 Hierarchy and member view

All members can browse department, system, and budget item. Show planned, spent, and difference at each aggregation level. Items show reference/ID, description, priority, plan, actual, and difference. Communicate overspending and earmarked status separately.

Cancelled items are hidden by default and can be revealed. Their historical spending must remain in actual totals. Unallocated items are not ordinary visible rows; show their aggregate spending under the system and department instead.

An earmarked item remains linked to its part. Public summaries show earmarked status and permitted amounts. Only Business and finance receive the source and condition annotations.

### 9.2 Budget lifecycle

- Exactly one Budget per season.
- The Head of Finance creates it as draft.
- Creation also makes one zero-plan unallocated item for every active system.
- The Head of Finance approves a draft, recording approver and date and auditing the status change.
- A budget cannot be approved twice.
- Approval has no implemented requirement that scenarios be covered or every item be reviewed.
- Board sign-off, where required, happens outside this application.
- Approval is one-way in the current UI. There is no reopen/version/rollback operation.
- Later changes update the same item records, retaining history in the audit log.

Plural "Budgets" in the destination navigation does not imply multiple versions or multiple competing budgets per season. A historical season browser would be a new navigation capability.

### 9.3 Budget-item fields

| Field | Behavior |
|---|---|
| System | Required; active when adding or changing system |
| Description | Required, nonblank |
| Category | `material`, `component`, `tooling`, `manufacturing_service`, `travel`, `fees`, `marketing`, `other` |
| Planned NOK | Numeric, finite, zero or greater |
| Priority | P1 essential; P2 important; P3 deferrable; P4 optional; EM earmarked |
| Earmarked part | Required for EM; empty for other priorities; must belong to funding in the same season |
| Reuse status | `new`, `reuse`, `inspect`, `consumable` |
| Expected purchase date | Optional valid ISO date |
| Owner email | Optional; current form uses an email input |
| Item status | `planned`, `active`, `done`, `cancelled`; new manual item defaults to planned |
| Note | Optional text |
| Change reason | Required for protected approved-budget changes |

The manual source form defaults to P1/material/new. CSV defaults differ, as described below. Preserve or deliberately unify them; do not assume every omitted priority becomes P1.

IDs, parent budget, and creation metadata cannot be edited. The source service accepts a defined allowlist of item fields. Backend validation, not form controls, must enforce the model.

### 9.4 Approval-dependent edits

While draft, finance and Head of Finance can maintain items without a mandatory reason. Audit changes regardless.

After approval, only the Head of Finance can add, cancel, restore, change planned amount, change priority, or change earmarked-part link. Each such operation requires a nonblank reason. Restoring a cancelled item counts as adding planned money back.

Finance can still edit other allowed fields, including description, category, reuse, expected date, owner, note, non-cancelling status, and, in the current code, system. The ability to move an approved item to a different system can change system-level budgets without changing total planned money. Decide whether that should remain permitted.

Cancellation retains the item ID and purchase links. Its effective plan becomes zero in aggregate calculations, but its stored original `planned_nok` remains. Restoration changes status to planned. Do not erase historical actual spending when either action occurs.

Unallocated items have a permanently zero plan and cannot be cancelled, moved, or edited through ordinary item maintenance. Only their note can be changed. If a new active system appears after budget creation, the first unbudgeted purchase can create its unallocated item even after budget approval.

### 9.5 Department CSV import and preview

Support pasted CSV text or a UTF-8 CSV/text file. Each import replaces the selected department's set of ordinary planned items through a diff; it is not an append-only import.

Template:

```csv
system_id;description;planned_nok;priority;category;reuse_status;expected_purchase_date;note;earmark_id
```

Parser behavior:

- Header required. Required columns are system_id, description, and planned_nok.
- Semicolon or comma separators; the current implementation chooses semicolon if the first line contains one, otherwise comma.
- Columns may appear in any order; header names are trimmed and lowercased.
- Reject unknown nonblank column names.
- Handle quoted cells, escaped quotes, delimiters and line breaks inside quoted cells, byte-order mark, CRLF, and blank records.
- Report original line numbers and field names.
- Empty or missing priority/category/reuse values become P2/other/new for parsed rows.
- Priority is case-insensitive, and Øremerket maps to EM.
- Parsed new rows have status planned.
- Validate money, dates, enums, active systems, department membership, duplicate matching keys, and earmark rules.
- Reject empty files and header-only files.

Preview must save nothing and show:

1. Each row, system name, description, priority, amount, and new/changed/unchanged classification.
2. Old/new values for changed fields.
3. Counts of added, changed, unchanged, and removed items.
4. Items to be cancelled because absent from the file.
5. Warning when an item to be cancelled already has actual spending.
6. System subtotals and total computed on the server.
7. Blocking errors with line/field context and nonblocking warnings.

### 9.6 Re-import semantics

Match on exact system ID plus description normalized for case and repeated whitespace. The parser trims description text. Despite broad wording in the documentation, system IDs are not lowercased by the matching function.

For a match, preserve the budget-item ID and all linked purchases. Compare only the optional fields whose columns are actually present in the input. Omitting a column must not wipe existing values. A cancelled matching item reappearing in the file is restored to planned; an active matching item keeps its existing lifecycle status.

For a new key, create an item. For an existing non-cancelled ordinary item in that department missing from the file, cancel it. Never alter another department or an unallocated item. Prefer a non-cancelled existing record over a cancelled one with the same matching key.

Changing the spelling of a description beyond case/whitespace creates a new key and can cancel the old item. Warn users that descriptions act as import identity. A future ID-based import would be a separate change.

Validate the combined result of the import before applying it. This matters when several rows attach to the same earmarked part. A part cannot end up paying for active items in multiple systems.

Apply the relevant permissions per change. After approval, an import that only changes notes can still be allowed for finance without a reason. An import that adds/removes items or changes protected values requires the Head of Finance and a reason. Revalidate the diff when committing because a preview can become stale.

The intended import contract is all valid rows or none. The source validates before writing under a lock, but lacks rollback after unexpected write failure. Implement the destination import in a database transaction. Audit created items, cancellations, and every changed field, with the import reason.

## 10. Financing page requirements

### 10.1 Funding records

Business, Finance, and Head of Finance can list, create, and edit funding in the current season.

| Field | Required behavior |
|---|---|
| Source | Required, nonblank name of funding source |
| Type | `sponsor_cash`, `grant`, `membership`, `other` |
| Amount NOK | Required positive, finite numeric amount |
| Status | `prospect`, `applied`, `secured`, `received`, `rejected`, `deleted` |
| Confidence | Empty, `high`, `medium`, or `low` |
| Expected date | Optional valid ISO date |
| Received date | Optional valid ISO date |
| Owner name | Required, nonblank person responsible for follow-up |
| Owner email | Optional |
| Reporting required | Boolean; default false |
| Application/agreement link | Optional saved link; exposed in the edit form |
| Note | Optional text |

Creation defaults in the UI are sponsor_cash/applied/empty confidence. The service defaults empty confidence and reporting false. Dates and confidence are not automatically inferred from status.

The source does not enforce a state machine for funding status. A permitted user can select any valid status; `received` does not require a received date, and there is no partial-receipt ledger. One amount represents the funding record, not installments or bank reconciliation.

List/detail information includes source, status, amount, type, owner, confidence, relevant dates, notes, earmarked parts, total earmarked, and general/unrestricted remainder. Provide access to the stored agreement link in a suitable destination design.

### 10.2 Earmarked parts

Each part belongs to one funding source and contains:

- Required nonblank purpose.
- Required positive exact amount in NOK.
- Optional valid `spend_by` date.
- Optional private condition text.
- System association derived through its non-cancelled budget items.
- Derived eligible spending, used amount, amount left, overdue state, and amount to return.
- Names/links of associated non-cancelled budget items.

Add and edit parts. The current edit fields do not include changing parent funding. There is no dedicated delete-part or restore-part operation. Deleting a funding source does not delete its parts or linked budget items.

The assignment from item to part is maintained in Budgets. Business can edit the funding agreement and parts but cannot change the budget item links itself under the source permissions. This is a real coordination boundary to preserve or change explicitly.

### 10.3 Over-earmarking

Sum a funding source's parts and compare with its amount. If parts exceed the source amount, save the agreement and show an explicit warning with the excess. Reducing the funding amount below existing earmarks has the same warning.

Do not silently scale earmarks, discard a part, or reject the agreement. The scenario calculation allows the general remainder to become negative, which exposes a shortfall.

### 10.4 Deleting and restoring financing

Delete means set status to deleted, retain the row, audit the status change, remove it from scenario financing, hide it by default, and remove its public earmark summaries from Overview. Retain item links and recorded spending.

If its parts pay for non-cancelled budget items, return a warning identifying the count. Spending on those items continues to contribute to need even when their source is excluded; their unspent earmarked plan stops counting in scenarios where the source does not count.

Allow permitted users to reveal deleted funding and restore it. Restore the status before the latest deletion using audit history. The source falls back to applied when it cannot recover a valid previous status. An explicit previous-status field or deletion event can replace this technical mechanism if behavior is equivalent.

## 11. Calculations to preserve

All examples below are acceptance examples, not statements about Helix's actual finances.

### 11.1 Money and dates

- Financial reporting uses NOK including VAT.
- Round money to two decimals per amount/line, half away from zero. Sum rounded values and round the total.
- The source's money helper handles binary rounding cases such as 1.005 becoming 1.01.
- User input accepts common Norwegian and English money forms, including `1 234,50`, `1.234,50`, `20.000`, `1234.50`, and `kr 20 000`.
- Empty money input becomes null for validation. Invalid text and text with more than two decimal digits must not silently become a different valid amount.
- Positive purchase/funding/earmark amounts are required. Budget plans may be zero.
- Dates are date-only ISO values. Avoid timezone shifts when storing or reading them.
- Operational today and timestamps use Europe/Oslo in the source.

The destination may use fixed-point decimals or integer øre. Preserve the tested outcomes and separate decimal formatting from arithmetic.

### 11.2 Actual, plan, difference, and budget use

```text
actual(item) = sum(allocation.amount_nok)
  for allocations whose line belongs to a registered purchase
  and whose budget_item_id is this item

effective_plan(item) = 0 when cancelled, otherwise planned_nok
difference(item) = effective_plan(item) - actual(item)

system_actual = actual across its ordinary and unallocated items
system_plan = sum of non-cancelled item plans
system_difference = system_plan - system_actual
department amounts = sums of their systems

used_fraction = actual / plan, rounded to four decimal places
  when plan > 0; otherwise null
```

Voided purchases contribute zero. Payment flags do not affect actual. A cancelled budget item keeps its actual cost. `done` does not remove an item's plan. Unallocated spending counts in actual, but has zero plan.

The current cancelled-item row still carries its stored planned amount while aggregates use zero. The destination should clearly distinguish historical plan from the effective plan to prevent apparent arithmetic contradictions.

Difference must not be labeled available cash. The documented future remaining formula is planned minus actual minus open commitments. Commitments and forecasts are absent from baseline calculations.

### 11.3 Scenario funding eligibility

| Scenario key | Source label | Financing included | Ordinary planned priorities included |
|---|---|---|---|
| downside | Nå | received + secured | P1 |
| current | Realistisk | downside + applied with high confidence | P1 + P2 |
| full | Optimistisk | current + all other applied + all prospect | P1 + P2 + P3 + P4 |

Rejected and deleted funding never count. Blank confidence is not high. Prospect funding only counts in full, even if confidence is high. These are inclusion rules, not probability-weighted expected values.

Only funding in the selected season and items in that season's budget participate.

### 11.4 Scenario need per item

```text
spent = registered actual for the item
plan = 0 if cancelled, otherwise planned_nok
remaining_plan = max(0, plan - spent)

need = spent + remaining_plan
  if the item's ordinary priority belongs to the scenario
  OR the item is EM and its funding source counts in the scenario

need = spent otherwise
```

Spending counts in every scenario because it has already occurred. This includes P3/P4 spending, cancelled-item spending, overspending, and unbudgeted spending. Need can exceed plan.

Example: an unspent P3 item planned at 10,000 contributes zero to downside/current and 10,000 to full. After 2,000 has been spent, it contributes 2,000 to downside/current and 10,000 to full. If 12,000 has been spent, it contributes 12,000 to every scenario.

### 11.5 Restricted funding in scenarios

For each scenario:

```text
funding_total = sum of eligible funding
counted_parts = parts whose funding is eligible
earmarked_total = sum of counted part amounts
general_funding = funding_total - earmarked_total

part_need = sum of scenario needs of items linked to that part
part_cover = min(part amount, part_need)
part_unused = part amount - part_cover
part_general_need = part_need - part_cover

total_need = sum of all item needs
need_from_general = total_need - sum(part_cover)
gap = max(0, need_from_general - general_funding)
```

Unused restricted money cannot cover unrelated items. Overspending beyond a restricted part's amount uses general financing. A negative general remainder is allowed and can cause a gap.

Example: financing totals 10,000, of which 8,000 is restricted to one part. That part's items need 3,000, and unrelated items need 5,000. Total need is 8,000, but general financing is only 2,000. Restricted cover is 3,000. General need is 5,000, so the gap is 3,000. Comparing total need with gross funding alone would incorrectly say the budget is covered.

### 11.6 Actual use of an earmarked part

```text
eligible_spent = sum of registered allocations to all items linked to the part
  where purchase_date <= spend_by, when a deadline exists

used = min(part amount, eligible_spent)
left = part amount - used
overdue = a deadline exists AND today > spend_by
must_return = left if overdue, otherwise 0
```

Purchases on the deadline are eligible. Purchases after it are not. A part is overdue starting the following day. Spending above the part amount is general money. Voiding an eligible purchase restores unused restricted money through recalculation.

Example: a part is 5,000 and has a 30 June deadline. Eligible purchases total 3,500; another 800 is dated 1 July. Used remains 3,500 and left is 1,500. On 1 July, must_return is 1,500. This is a calculated obligation indicator; the source does not execute or record the actual return transfer.

Scenario coverage and actual eligible use are separate calculations. The source scenario calculation does not receive the spending deadline and can cover recorded need differently from the deadline-aware usage calculation. Do not silently merge them into one formula. See the gap register.

## 12. Logical data model and field inventory

This is a migration dictionary, not a prescription to recreate spreadsheet tabs or duplicate existing platform tables. Existing platform departments, people, and seasons can be reused through stable mappings.

All business entities below have creation/update timestamps and actor identifiers in the source unless explicitly noted. Preserve historical source IDs and audit actors even if the destination also introduces internal UUIDs.

| Entity | Fields in the implemented schema | Notes |
|---|---|---|
| Season | season_id, name, start_date, end_date, status | Documented statuses planning/active/closed; no complete management or write-lock workflow |
| Department | department_id, name, lead_email, active | Reference data; owner-managed in source |
| System | system_id, department_id, name, is_engineering, cost_event_system, lead_email, active | Shared budgeting anchor; retain external cost-event mapping if data exists |
| Person | email, name, role, department_id, active | Can map to platform users and memberships |
| Budget | budget_id, season_id, status, approved_by, approved_date | One per season |
| BudgetItem | budget_item_id, budget_id, system_id, description, category, planned_nok, priority, reuse_status, expected_purchase_date, owner_email, status, note, earmark_id | Actual, difference, use, and future commitment values are derived |
| Funding | funding_id, season_id, source, type, amount_nok, status, confidence, expected_date, received_date, owner_name, owner_email, reporting_required, doc_link, note | One amount/status record; no payment installment entity |
| FundingEarmark | earmark_id, funding_id, purpose, amount_nok, spend_by, condition | System is derived from item links; no current system_id column |
| Supplier | supplier_id, name, org_number, contact, category, preferred, payment_terms, is_sponsor, active | Schema exists; no implemented management service or source registration dependency |
| Purchase | purchase_id, season_id, status, requester_email, buyer_name, supplier_id, supplier_name, payment_method, purchase_date, justification, requested_nok, approved_nok, approved_by, approved_date, refund_method, refund_to, refund_paid_date, urgent, comment | Request/approval fields are reserved; source registration does not populate an approval |
| PurchaseLine | line_id, purchase_id, description, quantity, unit, currency, amount_original, fx_rate, amount_nok | Source form writes NOK/1/stk; no FX conversion service |
| Allocation | allocation_id, line_id, budget_item_id, assembly_id, part_id, amount_nok, note | One per submitted line today; engineering references are future placeholders |
| Document | document_id, purchase_id, type, number, document_date, due_date, paid, paid_date, file_url, original_name | One per file; registration supports receipt/invoice only |
| Settings | key, value, description | No standard row timestamps; current season, dashboard departments, approval limit |
| Counters | key, last_value | No standard row timestamps; persistent reference sequences |
| AuditLog | timestamp, user_email, entity, entity_id, field, old_value, new_value, reason | Append-only field-change records; no entity key column |

Standard entity stamps are `created_at`, `created_by`, `updated_at`, `updated_by`.

### 12.1 Reference formats and continuity

| Record | Source format | Sequence scope |
|---|---|---|
| Season | S27 | Validated as S plus two digits by ID helpers |
| Budget | B-S27 | Deterministic per season |
| Budget item | BI-S27-001 | Running sequence per season |
| Unallocated item | BI-S27-FR-UNALLOC | Deterministic per season/system |
| Funding | F-S27-001 | Running sequence per season |
| Earmarked part | FE-001 | Global running sequence |
| Purchase | 2026-0042 | Sequence per calendar year of registration |
| Line | 2026-0042-L1 | Ordinal within purchase |
| Allocation | 2026-0042-L1-A1 | Ordinal within line |
| Document | 2026-0042-D1 | Ordinal within purchase |

Padding is minimum width; counters grow beyond 999 or 9999. Never truncate or reuse references. A void keeps its reference. Season changes do not reset the current calendar year's purchase sequence.

System IDs used in unallocated references must match SYS- followed by uppercase letters/digits. Examples are SYS-FR and SYS-TRAVEL. Keep a translation map if existing destination system IDs differ.

### 12.2 Organization mapping

The documented engineering codes are AT, BR, DT, ET, FR, LV, MS, ST, SU, and WT. Aero is within FR, not its own top-level engineering system. Non-engineering systems include tools/consumables, travel, events, design, social media, and common team spending. Competition fees and team event travel are documented under Markedsføring / Reise.

These are source reference conventions, not proof that every corresponding live row exists. Import the actual organization data and map it to the platform. Do not seed production from fictional preview data or assume the example list is a live export.

### 12.3 Suggested database invariants

The destination should enforce the following invariants using its database and service layer:

- One budget per season, unique stable source IDs, and unique purchase references.
- Required parent links for systems, items, lines, documents, allocations, and earmarks.
- Every allocation points to a budget item.
- Allocation sum equals line total for the supported allocation workflow.
- Money stored at the agreed precision and required positive/nonnegative bounds.
- Authorized current-season relationships for ordinary writes.
- EM requires a valid same-season part; other priorities have no part.
- One part's non-cancelled items belong to one system.
- Audit entries append with the write they describe.
- Purchase registration and imports commit their database changes together.

Some cross-row conditions require transaction-level validation rather than a simple column constraint. These recommendations strengthen the source's intended rules without treating Sheets as a transactional database.

## 13. Existing application operations and destination contracts

These names describe source behavior to replace. The destination may use routes, server actions, RPC, or services consistent with its architecture.

| Source operation | Inputs | Required capability / outcome |
|---|---|---|
| api_state | None | Authenticated role-filtered Finance read model |
| api_version | None | Domain member; cheap change token |
| api_createBudget | None | Head of Finance; current-season draft and unallocated items |
| api_addItem | Item form, optional/required reason | Finance with draft/approved rules; return item ID |
| api_editItem | Item ID, field patch, reason | Finance with field-dependent approval rules |
| api_cancelItem | Item ID, reason | Cancellation through edit permissions |
| api_approveBudget | None | Head of Finance; approve current draft |
| api_previewImport | CSV text, department ID | Finance; read-only diff, errors, warnings, counts, totals |
| api_importItems | CSV text, department ID, reason | Finance with per-change rules; apply recomputed diff |
| api_checkPurchase | Purchase form with file metadata | Member; validate and budget-match without saving |
| api_uploadDocument | Name, MIME type, base64 | Member; return staged file info |
| api_registerPurchase | Purchase form, staged file IDs | Member; final save and reference |
| api_voidPurchase | Purchase ID, reason | Finance; retain record and exclude its actual |
| api_markRefundPaid | Purchase ID | Finance; stamp refund date |
| api_unmarkRefundPaid | Purchase ID | Finance; clear refund date |
| api_markInvoicePaid | Document ID | Finance; set paid and date |
| api_unmarkInvoicePaid | Document ID | Finance; clear paid and date |
| api_addFunding | Funding form | Business/finance; current-season funding ID |
| api_editFunding | Funding ID, patch | Business/finance; validated audited update |
| api_deleteFunding | Funding ID | Business/finance; soft delete with dependency warning |
| api_restoreFunding | Funding ID | Business/finance; restore prior status |
| api_addEarmark | Funding ID, part fields | Business/finance; validated part ID |
| api_editEarmark | Part ID, patch | Business/finance; validated audited update |
| api_rebuildViews | None | Finance; rebuild derived scenarios and purchase output |

`api_state` publicly includes version, user, seasonId, budget status, overview, dashboard department ordering, active department/system choices, approval limit, today, and capability flags. Finance receives purchases, list error, approval ability, and full current-budget items. Funding-capable users receive funding, earmarks with source/status/usage, scenarios, warnings, and relevant option lists.

The destination can split this large response by page. It must retain server-side filtering and consistent calculations. Do not retrieve all finance data into a client cache and rely on UI components to hide it.

Mutation results generally follow:

```json
{
  "ok": true,
  "id": "2026-0042",
  "warnings": [],
  "errors": []
}
```

Validation failures include errors with `field`, `message`, and where relevant a one-based line number. Warnings can accompany success. Preflight, import preview, and registration add their domain-specific data. The destination need not preserve this JSON shape, but must distinguish successful warnings from blocking errors and provide field/line-level errors.

Owner-only script operations include schema setup, tab protection, reference continuation, purchase-output diagnostics, and bespoke go-live/data migration helpers. They are administrative tools, not member actions or Finance sidebar pages.

## 14. Shared behavior and technical adaptations

### 14.1 Move business rules out of the UI

Keep monetary calculations, permissions, reference creation, validation, and lifecycle decisions in tested server/domain code. The new frontend displays results and gathers input. Formatting and chart percentages may happen on the client; authoritative balances and decisions must not depend on client values.

The pure domain modules are the strongest reuse candidates: money, dates, IDs, budget, purchase, funding, earmarks, scenarios, and budget import. They use Apps Script global names with Node test exports. Convert their packaging to the destination's module conventions while checking behavior against the existing tests.

Services contain useful orchestration, but depend on the source Auth, repositories, locks, Drive, notifications, and derived sheet views. Port the use cases and invariants, then replace those adapters. The source Finance.html is behavior reference material; its layout and CSS are not a required migration input.

### 14.2 Transactions, retries, and concurrency

The source serializes writes with an Apps Script lock, waiting up to 30 seconds and reusing the lock in nested operations. Data writes bump a version token when the outer operation ends.

For the destination, use database transactions and atomic sequence allocation. Recheck mutable relationships, quotas, and permissions inside the transaction where needed. Add a submission idempotency key so a retry after a lost response cannot create a second purchase or email.

Treat attachment storage as an external side effect. Define ownership of staged files, finalization/recovery, and cleanup of abandoned uploads. A failed file move must not produce a successful purchase with missing evidence. A failed email or optional spreadsheet sync must not reverse the saved purchase.

The source disables buttons while saving to prevent ordinary double-click duplicates. Preserve that user-facing protection, but do not mistake it for server idempotency.

The source has no general optimistic edit conflict check. Decide how to reject or reconcile stale edits in the destination. Imports must always re-evaluate the proposed changes at save time.

### 14.3 Freshness and unfinished forms

The source polls a cheap version token every 30 seconds while visible, checks again when the tab becomes visible, and reloads data when it changes. It preserves the current tab, expanded sections, and scroll position.

Do not redraw an unfinished form automatically when another user saves. Show an update-available notice instead. An explicit refresh may replace current data, so the new UI should warn or preserve drafts when relevant. Offline/version-poll failures should not erase entered data.

The destination may use query invalidation, subscriptions, events, or polling. Preserve the outcome: read-only views become fresh, local successful saves invalidate related summaries, and another person's update does not destroy unsaved input.

### 14.4 Audit and retention

Append an audit entry for creations and relevant field changes. Record actor, timestamp, entity, entity ID, field, old value, new value, and reason when required. Keep creation/update metadata. Do not allow ordinary clients to supply trusted actor identities or rewrite audit history.

Never delete registered purchases through ordinary application operations. Use void. Cancel budget items and soft-delete funding. Retain documents and links needed to explain old costs. The source has no audit-log viewer or audit export UI, so adding one is optional even though preserving audit data is baseline.

### 14.5 Text handling and privacy

The source renders user text using textContent and escapes spreadsheet formula injection. Preserve safe text rendering. If the destination retains spreadsheet/CSV outputs, preserve appropriate formula-injection protection for those outputs. Do not blindly store spreadsheet-specific escaping in a relational database as if it were the original content.

Authorize private document retrieval. Private refund details must stay out of member/Business responses, emails, broad exports, analytics events, URLs, and ordinary logs. Ensure shared platform client caches and search indexes do not cross those permission boundaries.

### 14.6 Configuration

Replace source Script Properties SHEET_ID, FOLDER_ID, and PURCHASE_LIST_ID with the destination's server-side integration settings if those integrations remain. They are deployment dependencies, not fields for a member-facing form.

Retain configurable current season, dashboard department ordering, approval limit, and finance recipient membership. Source documents mention an urgent-period setting, but there is no working urgent-purchase flow to port.

## 15. Data migration and cutover scope

This section is a proposed migration process. No production migration has been performed, and the live source data has not been obtained.

1. Inspect the destination repository's instructions, identity model, organization model, database schema, routing, storage, notification system, and deployment process.
2. Obtain a read-only export of the actual source database and an inventory of its restricted documents. Include voided purchases, cancelled items, deleted funding, audit history, and counters.
3. Record the source version and export time. Keep an immutable backup and a repeatable import manifest.
4. Map users and historic actor emails to platform identities without rewriting the original attribution. Resolve accounts that no longer exist.
5. Map departments, systems, seasons, and external references. Preserve source IDs as stable external identifiers if internal IDs differ.
6. Import organization data, settings, budgets, funding, earmarked parts, items, purchases, lines, allocations, documents, and audit entries in dependency order.
7. Preserve decimal amounts, date-only values, approval metadata, payment dates, lifecycle states, and private refund strings. Keep leading zeros in reference-like and account fields.
8. Reconcile orphan links, duplicate IDs, invalid enum values, unusual historical states, and legacy system-level earmarks. Quarantine unclear records for review rather than guessing.
9. Verify that source escaped spreadsheet strings are decoded appropriately for the new store without activating formulas or changing original user text.
10. Decide whether attachments stay in Drive or move. Verify permissions and links in either case. If moving, verify count, metadata, size, and content identity and keep old-to-new links.
11. Initialize reference sequences above the highest preserved allocated reference, accounting for void records and existing counters. Never move a counter backward.
12. Recompute actuals, departmental/system totals, scenario results, earmark usage, and unpaid work from imported source facts. Compare with source calculations on the same snapshot and date.
13. Reconcile total purchase amounts, allocation totals, document counts, status counts, refunds, invoice states, and per-season balances. Historical test rows require explicit identification, not automatic deletion based on amount or name.
14. Conduct role-based acceptance checks with representative members, Business, Finance, and Head of Finance.
15. Stop the old write path before the new write path starts issuing references. Perform a final delta migration or a write-frozen export, reconcile again, then switch entry points.
16. Keep an agreed rollback plan and recovery backup. Once new references are issued, rollback must preserve their continuity and any new registrations.
17. Document finance ownership, backup/export procedures, integration failures, and handover responsibilities.

The source includes `migrateNuParts`, a specific NU grant transformation, and go-live helpers for copying its TEST spreadsheet and continuing references from Bilag Innsending. These are historical operational code, not a generic migration engine for this destination. Inspect whether their transformations are already represented in the actual export. Do not rerun their hardcoded funding amounts or test-clearing routines during migration by default.

Repository CSV fixtures contain examples used by tests. They can support behavioral regression checks but are not an authoritative current budget export.

## 16. Differences, limitations, and decisions that must remain visible

| Area | Observed source behavior / intended rule | Migration treatment |
|---|---|---|
| README/checklists | Several implemented capabilities remain described as planned | Use inspected code and tests for baseline |
| Large-purchase approval | Policy requires prior approval; current service registers and flags above-limit purchases | Preserve interim behavior unless the full approval workflow is selected |
| Commitments/remaining/forecast | Documented; domain/service implementation is absent | Do not show invented committed or forecast balances |
| Reallocation and purchase corrections | Documented; no complete editing operation | Separate later feature |
| Closed seasons | Status exists; ordinary mutation services do not consistently check it | Recommend enforcing read-only seasons in destination, recorded as a repair |
| Inactive people | In-domain inactive users fall back to member | Do not claim account suspension or reimbursement ban exists |
| Member history | Members receive no purchase list, including their own | Preserve unless explicitly changed |
| Business access | Business can manage financing and parts; cannot view purchases or edit budget links | Map capabilities independently |
| Multiple invoice files | Each is a Document; table uses first document and payment action targets one ID | Decide one invoice obligation versus several obligations/files |
| Invoice payment guard | PaymentService checks Document type but not parent purchase registered status; UI hides action on void | Add parent-state guard as a repair if selected |
| Payment/document combinations | Independently selectable; outlay display takes precedence | Decide which combinations the replacement accepts |
| Foreign currency | Fields and policies exist; registration writes NOK and fx=1 | Do not claim FX service or Norges Bank integration exists |
| Sponsored/in-kind | Documentation mentions sponsored payment; implemented purchase enum rejects it | Exclude from baseline; resolve cash versus in-kind treatment separately |
| Supplier management | Schema exists without directory workflow | Retain existing supplier text; optional later directory |
| Earmark deletion | Add/edit supported; no dedicated deletion | Design explicit unlink/archive policy before adding delete |
| Deadline versus scenario | Usage respects spend_by; scenario cover does not | Preserve separate outputs; obtain a rule decision before changing financial results |
| Over-earmarking | Warning and negative general remainder allowed | Preserve; never auto-scale agreements |
| Approved system reassignment | Finance can change system, despite impact on department totals | Decide whether to restrict as a governance repair |
| Cancelled rows | Original planned field retained, effective aggregate plan zero | Present history clearly; retain actuals |
| Multi-season register | App register reads all seasons; derived sheet uses current season | Decide filtering/history defaults and guard season writes |
| Staging ownership | Final registration checks staging presence but not user-bound upload ownership | Add user/session-bound upload authorization |
| Upload cleanup | Failed/abandoned flows can leave staged files | Add bounded cleanup/retry policy |
| Transactionality | Lock serializes writes; Sheets/Drive changes lack rollback | Use real transactions/recovery; do not copy partial-write risk |
| Retry duplication | Client busy flag only; no durable submission idempotency | Add server idempotency for registration and side effects |
| Rate limit concurrency | Count is checked outside lock | Make enforcement atomic if preserving strict 20/hour |
| Reference continuation | Administrative counter setter can assign a lower value | Initialize/advance monotonically during cutover |
| UI/privacy mismatch | Some comments say earmark conditions finance-only; Business receives them in code | Treat Business as funding-capable per current service policy |
| General data security | Direct spreadsheet edits are owner-controlled, not app forms | Use destination backend permissions; no need to reproduce spreadsheet protections |
| Grant repayment | must_return is calculated; no repayment record/action | Do not imply an actual repayment was made |
| Reporting marker | reporting_required is stored; no complete grant export UI | Preserve field and traceability; separate export feature |
| Integration failure | Email logs only; list error cached | Retain nonfatal behavior; recommend durable retries/status |

These are implementation and product decisions, not findings about misuse or production incidents. They should not be silently resolved by a new frontend.

## 17. Documented future functionality outside baseline

### 17.1 Purchase requests and approval

The intended later workflow creates requested purchases at least three days before buying, notifies the Head of Finance, supports approval/rejection with reasons, and creates open commitment after approval. Final registration attaches documents and replaces commitment with actual. A higher-than-approved total would trigger a deviation review. The documented tolerance is more than 10% or 1,000 NOK, whichever is lower, but the decision list still flags exact tolerance as unresolved. Urgent-period handling and approval emails are also planned.

This needs separate services, permissions, request/approval views, records of decisions, notifications, and test coverage. Adding status enum values or copying reserved fields alone does not implement it.

### 17.2 Corrections, cleanup, reporting, season close

Planned features include splitting/reallocating lines, changing registered amounts with reasons, returning unreadable documents to submitters, unallocated-spending cleanup, stale commitment reviews, grant report exports, formal season close, archived reports, and reusable-asset registration. The 14-day reimbursement/reallocation targets are operational targets, not automated reminders or enforced timers in this snapshot.

Only v_funding_scenarios and the external purchase list are built as derived spreadsheet outputs. v_budget_status, v_open_commitments, v_unpaid, and future engineering views are documented rather than fully implemented outputs.

### 17.3 Engineering and cost-event system

Later phases describe Assembly, Part, BomLine, Asset, ManufacturingLog, CostSettings, FSG systems/assemblies, materials, emission factors, machines, transport factors, and CostEventLine. They would connect purchase allocations to actual part costs, capture manufacturing time, calculate cost in EUR and CO2e, validate CCBOM completeness, and generate an import for the FSG CR tool and explanation tables.

These modules are not part of the implemented four-page Finance baseline. Preserve stable system mappings and optional allocation reference fields where existing data requires them, but do not introduce a parts/BOM/cost-event product as an implicit dependency of the migration.

## 18. Explicit exclusions

The source application excludes general-ledger bookkeeping, tax/VAT accounting, payroll, customer invoicing, sponsor CRM, and event management. It supports finance operations and evidence for official accounts; it does not replace official accounting.

This migration also excludes, unless separately selected:

- Executing bank payments, reimbursements, or grant repayments.
- Bank reconciliation and verified bank-balance dashboards.
- Purchase approval workflows absent from the source.
- Automatic FX retrieval/conversion.
- In-kind sponsorship costing.
- OCR, receipt extraction, automatic categorization, and AI processing.
- New procurement, supplier, engineering, or asset products.
- Automatically importing any live Google data without a reviewed migration source.
- Reusing the old UI or requiring Apps Script/Sheets as the destination architecture.

## 19. Acceptance criteria for baseline parity

Use existing tests as regression material and add destination integration tests for its actual database, authentication, storage, and notification boundaries. The examples below specify results rather than component structure.

### 19.1 Permissions and exposure

| ID | Scenario | Expected result |
|---|---|---|
| PER-01 | Ordinary member opens Finance | Overview, Purchases submission, and public Budgets work |
| PER-02 | Member requests a finance register API directly | Access denied; no purchase rows or attachment URLs returned |
| PER-03 | Member submits a valid purchase | Reference and warnings returned, without historical purchase listing |
| PER-04 | Business opens Financing | Can read and maintain funding/parts and see scenarios |
| PER-05 | Business calls payment, void, import, or item-edit operations | Access denied |
| PER-06 | Finance opens a registered outlay | Refund destination is visible and can be marked reimbursed |
| PER-07 | Member/Business read response or notification is inspected | No private refund number; member receives no funding source/condition/scenario data |
| PER-08 | Unauthenticated or unauthorized platform account calls mutation API | Access denied before writes or uploads |
| PER-09 | Elevated source person becomes inactive | Source-equivalent mapping removes elevation; platform suspension is handled separately |

### 19.2 Purchases and documents

| ID | Scenario | Expected result |
|---|---|---|
| PUR-01 | Valid two-line receipt purchase submitted | One registered purchase, two lines, two full-value allocations, documents, reference, audit |
| PUR-02 | Quantity 3, line amount 900 | Total contribution is 900, not 2,700 |
| PUR-03 | Several lines use the same item | Budget warning compares combined new amount plus existing actual |
| PUR-04 | Purchase exactly at threshold, then above threshold | First has no above-limit flag; second warns and saves under interim policy |
| PUR-05 | Item would exceed budget | Save succeeds with excess warning |
| PUR-06 | User explicitly chooses not in budget | Correct system unallocated item used; zero plan; actual appears in system total and unbudgeted subtotal |
| PUR-07 | User leaves item blank or chooses wrong-system/cancelled item | Reject with line/field errors; no normal-form upload |
| PUR-08 | Missing file, invalid date, future purchase date, short justification, nonpositive amount/quantity | Reject with useful errors |
| PUR-09 | Outlay account has 11 digits; phone has 8 | Accept valid format; reject invalid lengths; do not treat as checksum verification |
| PUR-10 | Non-outlay form contains a stale refund field | Server discards it |
| PUR-11 | Allowed file at size limit; file above limit; 16 files | First permitted by size rule; oversized and excess-count submissions rejected |
| PUR-12 | Final registration references a missing/already finalized staged file | Reject without creating a duplicate purchase |
| PUR-13 | 20 registrations by user in last hour, then another | Further registration rejected by quota |
| PUR-14 | Email delivery or optional purchase-output sync fails | Saved purchase remains; appropriate integration error/retry behavior |
| PUR-15 | Prior-date purchase registered in a new calendar year | Reference uses registration year; archive month follows purchase date |
| PUR-16 | Successful submit followed by new purchase | Reference confirmation visible; new form starts clean |

### 19.3 Payment and void behavior

| ID | Scenario | Expected result |
|---|---|---|
| PAY-01 | Registered outlay is unrefunded | Appears in unpaid queue |
| PAY-02 | Finance marks and undoes reimbursement | Date set/cleared; audit; unpaid count changes; actual unchanged |
| PAY-03 | Invoice marked paid and then undone | Boolean/date change; audit; actual unchanged |
| PAY-04 | Repeated mark, wrong type, or unauthorized user | Reject; no false success |
| PAY-05 | Finance voids registered purchase with reason | All facts/documents retained; actual and scenario need recompute; unpaid exclusion |
| PAY-06 | Void request has no reason or is already void | Reject |
| PAY-07 | Multiple invoice attachments | Behavior matches the explicit destination obligation/file decision |

### 19.4 Budgets and imports

| ID | Scenario | Expected result |
|---|---|---|
| BUD-01 | Head of Finance creates season budget | One draft plus active-system unallocated items |
| BUD-02 | Finance/member tries budget creation; duplicate creation | Denied or duplicate error |
| BUD-03 | Finance edits draft item | Valid allowed changes saved and audited without mandatory reason |
| BUD-04 | Head of Finance approves draft | Approver/date recorded; repeat approval rejected |
| BUD-05 | Finance changes protected field on approved item | Rejected |
| BUD-06 | Head of Finance changes protected field without/with reason | First rejected; second saved with old/new/reason audit |
| BUD-07 | Finance changes only an allowed note after approval | Saved without mandatory reason |
| BUD-08 | Cancel item with historical spending | Effective plan zero; actual preserved; hidden by default and restorable |
| BUD-09 | Unallocated item's plan or status edited | Rejected; note-only edit allowed |
| BUD-10 | New active system first gets unbudgeted spending after approval | Automatic zero-plan item created without ordinary budget-add approval |
| BUD-11 | Preview valid CSV | No writes; correct row classifications, totals, removals |
| BUD-12 | CSV has an invalid row, foreign department system, unknown column, or duplicate key | Whole import rejected with row/field context |
| BUD-13 | Identical CSV re-import | Stable IDs, no duplicate items, unchanged classification |
| BUD-14 | Import changes amount, omits one optional column, and omits an existing item | Amount updates, omitted field survives, absent item cancelled with spending warning if needed |
| BUD-15 | Cancelled matching item reappears | Existing ID restored to planned |
| BUD-16 | Approved-budget note-only versus protected import | Appropriate per-change finance/Head of Finance and reason checks |
| BUD-17 | Import file changes during preview or other user edits budget | Commit recomputes and revalidates diff |

### 19.5 Financing and calculations

| ID | Scenario | Expected result |
|---|---|---|
| FIN-01 | Funding lacks source/owner, has invalid enum/date or nonpositive amount | Rejected with field errors |
| FIN-02 | Funding status/amount changes | Audited; scenario totals update |
| FIN-03 | Parts exceed funding amount | Saved with exact excess warning; negative general remainder visible in calculation |
| FIN-04 | EM item lacks part or part belongs to another season | Rejected |
| FIN-05 | Same part would pay for active items in two systems | Rejected, including batch import result |
| FIN-06 | Part has no active items | Retained and visible as unassigned where appropriate |
| FIN-07 | Funding deleted then restored | Data/links retained; scenarios/public parts disappear and return with prior status |
| FIN-08 | Medium/blank-confidence applied or high-confidence prospect | Excluded from current; included in full |
| FIN-09 | P3 spending or unbudgeted spending occurs | Actual contributes to every scenario; future P3 plan only full |
| FIN-10 | Restricted money is unused while unrelated need exists | Unused restricted balance cannot cover that need |
| FIN-11 | Purchase on deadline versus after deadline | On-deadline allocation eligible; later allocation excluded from part usage |
| FIN-12 | Day after deadline with unused restricted money | must_return equals eligible unused balance |
| FIN-13 | Registered eligible purchase is voided | Part usage decreases and left/return amount recomputes |
| FIN-14 | Scenario has shortfall | Warning only; no unrelated save blocked |
| FIN-15 | Registered invoice becomes paid | Actual and need stay unchanged |

### 19.6 Shared reliability and cutover

| ID | Scenario | Expected result |
|---|---|---|
| SYS-01 | Two users register concurrently | Distinct references; intact related records |
| SYS-02 | Imported history includes voided highest reference | New sequence advances past it |
| SYS-03 | Lost response triggers retry | Destination idempotency decision prevents duplicate registration/side effects |
| SYS-04 | Another user updates data while no form is open | Read-only view refreshes without losing location |
| SYS-05 | Another user updates while a form has input | Input retained; update notice or equivalent |
| SYS-06 | User text resembles HTML or spreadsheet formula | Rendered safely; exports do not execute it |
| SYS-07 | Snapshot imported into destination | Source/destination totals, scenarios, document counts, payment states, and audit references reconcile |
| SYS-08 | Closed season mutation attempted | Behavior follows an explicitly agreed rule; recommended result is server rejection |
| SYS-09 | Member guesses an attachment URL or staged file ID | Destination storage/ownership authorization prevents access or reuse |

## 20. Suggested implementation sequence

This is an ordering recommendation, not an authorized implementation plan or published ticket set.

1. Reconcile destination identities, organization, season conventions, and storage/notification adapters. Decide high-impact permission and data-model differences.
2. Port the pure calculations and validations with existing regression examples. Establish schema, audit, transactions, and stable references.
3. Implement role-filtered reads for Overview and Budgets, then Financing maintenance and earmark linking.
4. Implement budget creation/approval, item maintenance, and department import with previews and transactions.
5. Implement staged documents and purchase registration, then the finance register, payment markers, voiding, and notifications.
6. Connect freshness behavior, nonfatal integration errors, and any retained external purchase output.
7. Rehearse data migration on an isolated dataset, reconcile results, run permission/integration acceptance, then prepare a reviewed cutover.

If immediate member submission is the priority, purchase work can move earlier after its budget/identity dependencies exist. Do not bypass the budget-link and document requirements to make that shortcut.

## 21. Decisions to resolve in the destination repository

| Decision | Recommended starting point | Why it matters |
|---|---|---|
| Platform identity and finance permissions | Reuse platform identity; map source capabilities explicitly | Avoid duplicate user directories and accidental elevated access |
| Current season versus selectable history | Current-season default with explicit finance history filtering | Source app/list season behavior differs |
| Ordinary members' own purchase history | Preserve no-history baseline initially | Adding history changes access and attachment expectations |
| Scope of missing procurement workflows | Baseline parity first; separately scope requests/approval/corrections | Prevent reserved fields from becoming implied functionality |
| Invoice obligations and attachments | Model one obligation separately from its supporting files if multiple files are common | Source first-document state is ambiguous |
| Closed-season writes | Enforce read-only on server | Matches documented financial-history policy |
| Approved item system changes | Review whether Head of Finance/reason is required | Changes departmental allocation of approved money |
| Deadline-aware scenario funding | Preserve current formulas until a finance rule is agreed | A change can alter funding gaps |
| Drive archive and purchase spreadsheet | Retain until equivalent access/archival process is agreed | Finance may rely on external records |
| Notification transport | Use destination's server integration with durable delivery status/retry | MailApp is source-specific |
| Reference format | Preserve public YYYY-NNNN references and historic IDs | Continuity with receipts, emails, and legacy accounting evidence |
| New UI language | Follow platform language; retain source enum keys where useful | Existing user-facing source text is Norwegian Bokmål |
| Data migration source | Actual exported database/documents, reviewed for test/legacy rows | Repository fixtures and preview are not production facts |
| Future earmark removal | Explicit archive/unlink policy before adding delete | Existing spending and EM links need retention |

No answers to these are fabricated here. They do not block delivery of this source inventory, but some block a production-ready implementation specification.

## 22. Handoff instruction for the destination repo

The following can be used as the opening implementation-scoping prompt alongside this document:

> Integrate the implemented functionality described in this scope into the existing Helix internal platform under Finance, using Overview, Purchases, Budgets, and Financing. Inspect this repository's instructions, authentication, permissions, organization data, database, storage, notifications, and UI conventions first. Rebuild the UI using this platform's design. Preserve the source's role boundaries, financial calculations, budget lifecycle/import semantics, purchase registration, payment tracking, voiding, earmarked funding, references, and audit history. Treat documented-only future features as outside baseline. Identify the destination-specific decisions and explicit repairs in sections 16 and 21 before implementing the affected flows. Prepare a repository-specific plan and migration approach with acceptance tests. Use real exported data only when supplied and authorized; do not use the local preview's fictional records as production data.

## 23. Source map and verification record

All paths below refer to the inspected commit. The links are repository permalinks for a reviewer who does not have this local clone.

| Subject | Source |
|---|---|
| Architecture, boundaries, ownership | [ARCHITECTURE.md](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/ARCHITECTURE.md) |
| Intended financial/governance rules | [BUSINESS_RULES.md](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/BUSINESS_RULES.md) |
| Intended data model and future entities | [DATA_MODEL.md](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/DATA_MODEL.md) |
| Workflows and phase boundaries | [WORKFLOWS.md](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/WORKFLOWS.md), [IMPLEMENTATION_PLAN.md](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/IMPLEMENTATION_PLAN.md) |
| Public operations and input conversions | [src/main.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/main.js) |
| Role mapping | [src/services/auth.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/auth.js) |
| Role-filtered read model | [src/services/appState.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/appState.js) |
| Purchase validation and budget match | [src/domain/purchase.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/purchase.js) |
| Purchase save, files, rate limit, void, list | [src/services/purchaseService.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/purchaseService.js) |
| Payments and reimbursements | [src/services/paymentService.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/paymentService.js) |
| Budget rules and overview calculations | [src/domain/budget.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/budget.js) |
| Budget lifecycle and import orchestration | [src/services/budgetService.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/budgetService.js) |
| CSV parsing and diff | [src/domain/budgetImport.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/budgetImport.js) |
| Funding validation | [src/domain/funding.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/funding.js) |
| Funding and part operations | [src/services/fundingService.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/fundingService.js) |
| Funding scenarios | [src/domain/scenarios.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/scenarios.js) |
| Exact earmark usage | [src/domain/earmarks.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/earmarks.js) |
| Derived scenario output | [src/services/views.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/views.js) |
| Finance email | [src/services/notify.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/notify.js) |
| External purchase list and failure handling | [src/services/purchaseList.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/purchaseList.js) |
| Implemented fields and row types | [src/repo/schema.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/repo/schema.js), [src/repo/rows.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/repo/rows.js) |
| Drive staging and naming | [src/repo/drive.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/repo/drive.js) |
| IDs and rounding | [src/domain/ids.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/ids.js), [src/domain/money.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/domain/money.js) |
| Write serialization, versioning, persistence | [src/repo/lock.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/repo/lock.js), [src/repo/version.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/repo/version.js), [src/repo/db.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/repo/db.js) |
| Existing frontend workflow behavior | [src/ui/Finance.html](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/ui/Finance.html) |
| Legacy administrative transformations | [src/services/migrations.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/src/services/migrations.js) |
| Service regression examples | [tests/services/services.test.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/tests/services/services.test.js), [tests/services/purchases.test.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/tests/services/purchases.test.js) |
| Browser behavior and entrypoint tests | [tests/ui/financePage.test.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/tests/ui/financePage.test.js), [tests/ui/entrypoints.test.js](https://github.com/oskarrandel/helix-finance/blob/6bf4b15a51b50e86b4212e62c8b2dfb552eed1e9/tests/ui/entrypoints.test.js) |

Verification performed on 26 October 2026:

- Inspected the source domain modules, application services, runtime schema, entrypoints, existing UI workflows, setup/migration code, and relevant tests alongside the five main specification documents.
- Installed the repository's locked development dependencies with lifecycle scripts disabled. No application source changes were made for this scope.
- Ran `npm test -- --runInBand`. All 430 tests in all 17 suites passed. Jest initially reported an asynchronous open-handle warning after completing its assertions, then the command exited successfully. The warning concerns test-process cleanup rather than a failing assertion.
- The existing tests exercise domain rules, fake-Sheets repository behavior, services, entrypoint authorization, and the frontend through jsdom. They include golden scenario/import examples and payment, privacy, and live-refresh behaviors.
- The test doubles simulate Google services. Passing this suite does not certify production Google deployment, Drive permissions, real email delivery, or the uninspected destination platform. The new platform needs its own integration and migration acceptance checks.
