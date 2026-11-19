# PBA-02: Draft project budgets and complete both approval stages

## Parent and requirements

Feature: `project-budget-approvals`, specification revision 1.
Parent: [HELIX-75](https://linear.app/helixnmbu/issue/HELIX-75/project-budgets-approvals-and-purchase-tracking), approved specification revision 1. Read the complete approved specification before implementation.
Requirements: F-01, F-02, F-04, F-05, F-14.
Tracker: Linear HELIX, project P-HELIX-4, existing Finance milestone.
Source: scope.md decisions D1-D10. Approved for publication on 19 November 2026. Implementation starts only with a separate Deliver request.

## What to build

Deliver the first complete project budget journey through project drafting, department review and Head of Finance approval. Add scoped entry points in project/department spaces and the Finance review queue, backed by version-specific server decisions.

## Acceptance criteria

- [ ] Any assigned project lead can create the one project/season budget and add/edit ordinary P1-P4 entries without needing broad Financials access. Require one responsible project department; choose it explicitly for multi-department projects.
- [ ] Render exactly the four agreed stages. Submission locks that candidate's contents; a current responsible department lead can approve it, then only Head of Finance can approve it. Finance can view department-pending submissions but cannot act on them.
- [ ] Return for correction requires a reason and returns the candidate to Draft. A project lead can withdraw to Draft with a reason. A changed/resubmitted candidate starts both approval steps again.
- [ ] Record actors, version contents, reasons and decision times. Duplicate/retried approvals cannot create duplicate decisions; stale or concurrent decisions fail safely and preserve input.
- [ ] Publish the approved version atomically and refresh the affected project, department and Finance views. Send reviewer/author notifications through shared app notifications and the existing durable outbox, without sending private financial details.
- [ ] Use existing shadcn forms, tables, selects, dialogs and Radix behavior. User-facing copy stays English; do not add status-only dialogs or inline status banners.

## Blocked by

HELIX-76. These must be integrated and their contracts available before scheduling this ticket.

## Shared contracts and change areas

New project-budget service/domain/UI modules; src/features/Workspace/ProjectDetail.tsx, ProjectSidebar.tsx and department views; Finance BudgetsPage/FinanceAccess; existing finance API dispatch and outbox. Reuse PBA-01 contracts. Shared router/access edits belong to the coordinator; PBA-08 later enriches these same list/detail views.

Likely paths were inspected during Prepare; recheck them on the actual delivery base. Keep English shadcn/theme presentation, shared notifications, current authentication and loopback-only fixtures. Use durable request IDs, revision checks and exact money. No live service writes or deployment are implied by this ticket.

## Verification

- Service/database scenarios V-01 and V-02, including wrong department, ordinary Finance final approval denial, returning, resubmission, revoked assignments and duplicate requests.
- Run real PostgreSQL concurrent department/final-decision cases through separate connections.
- Inspect the complete role-switched local UI journey, keyboard form use, focus restoration and notification recovery. Retain screenshots outside the repository.

Specification cases: V-01, V-02, V-09.

## Status

Approved, published in Linear. Blocked by the dependencies above once approved. Record real verification and review evidence before closure.

