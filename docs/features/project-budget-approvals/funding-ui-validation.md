# Funding application UI validation

PBA-07 adds application classification to existing Pipeline cards, a limited Head of Finance application view, explicit award/link/proposal/release forms, and project-scoped proposal adoption. The Finance page does not fetch the pipeline, organizations, contacts or negotiation notes. Pipeline classification has its own card endpoint under current Pipeline permissions.

## Run the dedicated fixture

From this checkout, use installed dependencies and an untracked `.env.local` containing `VITE_MEMBER_PLATFORM=true`:

```sh
./node_modules/.bin/vite --mode member-local --host 127.0.0.1 --port 5298 --strictPort
```

Fixture reads and writes require both `isLocalMemberMode()` and `localMemberSignedIn()`. The mode requires development on loopback. Production continues to use bound member sessions and scoped server authorization. No member grants, real applications or live services are changed by fixture selection.

| Role | URL |
| --- | --- |
| Marketing | `http://127.0.0.1:5298/sponsor-pipeline?fundingRole=marketing` |
| Head of Finance | `http://127.0.0.1:5298/finance/funding-applications?fundingRole=head_of_finance` |
| Ordinary Finance, for denial | `http://127.0.0.1:5298/finance/funding-applications?fundingRole=finance` |
| Project lead | `http://127.0.0.1:5298/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=project_lead` |
| Department lead | `http://127.0.0.1:5298/departments/mechanical-and-production?tab=budgets&budgetRole=department_lead` |
| Head of Finance budget approval | `http://127.0.0.1:5298/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=head_of_finance` |

The explicit role parameter takes precedence over the saved local funding role. These permissions concern the fixture workflow; global member access remains unchanged. The local Head of Finance profile is denied the Pipeline repository and classification card endpoint. Its limited application endpoint returns classified application data only. It never receives contact or negotiation fields. Existing normal Pipeline behavior remains available under Marketing's existing local Pipeline access.

Marketing's URL seeds one disposable Pipeline card, **Workshop equipment application**, with private contact/negotiation fixture fields that the limited Finance DTO excludes. It does not classify the card, create cash, award funding or approve a budget. Classification requires the explicit form action below.

## Browser script for root's isolated IAB

1. Open the project-lead URL. Create the Chassis & assembly budget, explicitly choose Mechanical & Production, add **Frame tubes**, NOK **1,000.00**, ordinary priority P2, then submit. Give department approval and Head of Finance approval through their respective URLs. This creates a real sequence of fixture decisions rather than seeded approval.
2. Open Marketing's Pipeline. On **Workshop equipment application**, choose **Funding application**, select S27 and enter purchase conditions, such as `Purchase workshop equipment required by the award.` Save application.
3. Open the limited Head of Finance URL. The application opens automatically if it is the only classified card. Inspect its purchase conditions. No organization list, contacts, negotiation notes, unrelated cards or broad Pipeline actions appear.
4. Choose **Link budget entry**. Select Frame tubes and **Link entry**. Its obligation remains **Awaiting award** and the budget priority stays P2.
5. Choose **Propose purchase**. Keep New budget entry, enter **Drill press**, NOK **250.25**, a project system and ordinary P1. Send proposal. Alternatively choose Frame tubes and enter a higher new total to propose an increase; system, category, reuse, owner and note values remain preserved.
6. Choose **Record funding award**. Enter an award date and reference and record the award. Linked obligations become mandatory P0. The proposed Drill press amount remains separate from the approved plan, and the approved project total remains NOK 1,000.00. No cash receipt or sponsor/Marketing task is created.
7. Return to the project-lead URL. **Funding budget proposals** shows Drill press and its proposed amount. **Review Drill press → Adopt into Draft** creates or updates the candidate without changing the approved plan. An already submitted candidate must first be returned or withdrawn to Draft through the existing reasoned workflow.
8. Submit the candidate, give department approval and Head of Finance approval. Only then does approved plan become NOK 1,250.25. The application proposal changes to **Budget approved**.
9. In the Head of Finance application view, **Release obligation** requires a reason and retains award/link/release history. If no other unreleased award covers an entry, its current approved ordinary priority is restored. A pending link instead offers **Remove link**, also requiring a reason; a later award does not activate that released link.
10. Open the ordinary Finance URL. It shows **Head of Finance access required** and no private application details. Finance may read scoped project proposals but cannot award, release or adopt on behalf of the project lead.

The explicit award action is the only activation event. A normal Pipeline Won transition, classification, funding reconciliation or cash receipt does not itself activate P0. Existing sponsor Won follow-up remains separate.

Reset only `helix-funding-applications-local-v1` and `helix-funding-applications-local-role-v1` on this loopback origin to clear funding fixture records. Budget and partner data retain their normal keys; clear their documented disposable keys only when intentionally starting the entire workflow over.

## Evidence and integration

The affected nine-suite selection passed 102 tests before final focus/classification/increase regressions. It includes the new funding repository/component/local lifecycle tests plus existing MemberPlatform, Pipeline, local sponsor, initial budget and revision component suites. All three typechecks passed and the source deployment guard remained 11/11. Final focused outcomes are reported with the commit handoff.

Coverage includes limited endpoint dispatch, absence of private Pipeline fields, ordinary Finance denial, classification, explicit award-only P0, new proposal adoption through both budget reviews, exact pending/approved money separation, multiple awards, release reasons, pending-link removal, stale-form recovery, delayed session-ending responses, gate rechecks, preserved increase fields, keyboard dismissal and opener focus. Backend authorization, canonical SQL guards and transaction races are verified separately by the owning backend worker. Local fixtures do not establish configured service acceptance.

The worker made no CUA calls for this slice. Root owns isolated browser verification and screenshots; this document does not claim that observation before it is completed. No native app or persistent grant editing is needed.

`FundingBudgetProposals` is a standalone module inserted into `ProjectBudgetsPanel`. Its `proposalDirty` flag joins the panel's dirty state while the adoption dialog is open. During integration, retain it alongside PBA-05's `purchaseDirty` and the existing `importOpen` state, so background refresh does not discard any open form. The new application route is a client route inside authenticated MemberAccess, with its own Head of Finance API authority; it is intentionally outside broad FinanceGate and Pipeline gates. No top-level serverless route was added.
