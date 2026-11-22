# Initial approval UI validation

This workflow covers PBA-02 only. Production reads and writes use the existing `/api/finance` entry point with the authenticated member session. The project Budget tab does not require the broad Financials grant; server-returned project and department capabilities govern its controls. The Finance page retains its existing Financials gate.

## Run locally

From the feature checkout, use the installed dependencies and an untracked `.env.local` containing `VITE_MEMBER_PLATFORM=true`:

```sh
./node_modules/.bin/vite --mode member-local --host 127.0.0.1 --port 5292 --strictPort
```

The fixture repository is available only when `isLocalMemberMode()` and `localMemberSignedIn()` both pass. The mode itself requires a development server on loopback. Role parameters never change production authorization.

Open these URLs in the same browser origin. They all retain the same project budget across navigation and reloads:

| Role | URL | Expected controls |
| --- | --- | --- |
| Project lead | `http://127.0.0.1:5292/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=project_lead` | Create, choose responsible department, edit Draft P1–P4 entries, submit, withdraw submitted candidate with a reason |
| Department lead | `http://127.0.0.1:5292/departments/mechanical-and-production?tab=budgets&budgetRole=department_lead` | Review the responsible department's submitted budget, approve to Finance or return with a reason |
| Finance | `http://127.0.0.1:5292/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=finance` | Inspect department-pending and Finance-pending contents; no approval controls |
| Head of Finance | `http://127.0.0.1:5292/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=head_of_finance` | Approve a department-approved candidate, or return it with a reason |

The selected role is retained for navigation without a role parameter. Adding another valid role parameter switches it. Page preferences preserve a valid role parameter only in the signed-in loopback mode and do not save it as a product preference. There is no role selector or environment banner in the interface.

The fixture uses actual projects from the normal local workspace, including saved projects and their current lead/department assignments. The initial Chassis & assembly project has multiple departments: choose Mechanical & Production for the documented department reviewer. Finance system choices are matched through the existing canonical department mapping, including Electrical → Electronics.

To reset this feature's disposable state in browser development tools, remove only `helix-project-budgets-local-v1` and `helix-project-budgets-local-role-v1` from this loopback origin's local storage. Other workspace data uses its existing storage keys.

## Observed browser journey

On 19 November 2026, native CUA inspection in Dia at `127.0.0.1:5292` verified:

1. Project Budget tab creates the Chassis & assembly Draft with Mechanical & Production as the explicitly chosen responsible department.
2. Add entry accepts Frame tubes, NOK 12,000.25 and P1. The saved entry, proposed total and Draft controls render correctly.
3. Submission shows **Sent to approval (Department lead)** and removes entry editing controls.
4. The department Budgets tab shows that candidate and **Approve and send to Finance**. Approval changes its stage to **Sent to approval (Finance)**.
5. The ordinary Finance role sees the exact submitted contents with no approval controls.
6. Head of Finance sees **Approve budget**; final approval displays **Approved**, the NOK 12,000.25 approved total, unchanged entry and the submission/department/final approval history.

The empty and approved views were inspected with native screenshots returned inline by CUA. That surface returned image bytes in the tool result, not a saved filesystem path. No screenshot artifact was committed.

The broad `/finance/budgets` page was component-tested with its real project budget panel. Its browser verification remains open: the default local Alex Example account has no Financials grant. An attempted **Members → Edit Alex Example → Access → Financials → Save access** was rejected by automatic approval review as an unauthorized persistent privileged access change. The rejected action was not retried, and no alternative grant mutation was used. Scoped role browser checks above completed without that grant. A dedicated local Finance fixture can cover this page in PBA-09.

## Automated checks

The focused suites cover the complete two-stage role workflow; immutable submitted entries; return/resubmit resets; stale revision rejection and exact retries; loopback/signed-in gates; role persistence; exact large money rendering; Electrical/Electronics compatibility; production API URL/body/session contracts; project/department/Finance entry points; Radix form focus and Escape dismissal; dirty input retained across focus refresh and stale writes; rapid-click deduplication; session invalidation during a delayed mutation; repository changes while old saves are pending; recovery callbacks invalidated by scope/session changes; and opener focus restored after asynchronous saves.

```sh
npm run typecheck
./node_modules/.bin/vitest run \
  src/features/Finance/project-budget-local.test.ts \
  src/features/Finance/project-budget-repository.test.ts \
  src/features/Finance/ProjectBudgetsPanel.test.tsx \
  src/features/Finance/ProjectBudgetEntrypoints.test.tsx \
  src/features/Finance/BudgetsPage.test.tsx \
  src/features/MemberPlatform/MemberPagePreferences.test.tsx \
  src/features/MemberPlatform/MemberPlatform.test.tsx \
  src/features/Workspace/DepartmentMembers.test.tsx --maxWorkers=1
```

The repository's current ESLint configuration ignores TypeScript and TSX paths; targeted ESLint therefore reports ignored-file warnings rather than a TypeScript lint result. Client type checking and the component/repository suites provide the applicable checks for this slice. The backend worker separately verifies real database permissions, locked transitions, outbox composition and concurrent decisions.
