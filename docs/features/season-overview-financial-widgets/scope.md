# Season overview financial widgets

Status: ready-for-prepare
Updated: 29 October 2026
Feature: `season-overview-financial-widgets`

## Problem and outcome

The Season Overview should give its readers an understandable picture of the season's estimated total budget, recorded spending, money in the bank, and spending by department. It should complement the existing project progress and milestones, allowing a reader to understand the financial position at a glance.

This is scoping work. It does not authorize application implementation, database changes, publication, or deployment.

## Confirmed request

- Add easy-to-understand financial widgets to Season Overview.
- Show the estimated total season budget, what has been spent, and how much is in the bank.
- Break spending down by department and potentially further, where useful.
- Keep the interface in English and consistent with the existing shadcn/ui theme. Use shared notifications for status, errors, and recovery.

## Current repository behavior

- `src/features/ProjectManagement/ProjectManagement.tsx` renders Season Overview and its progress and milestones. Season Overview and Financials are separately granted spaces.
- `src/features/Finance/OverviewPage.tsx` already displays department budget summaries with expandable system summaries. `api/_lib/finance-summary.ts` calculates department and system aggregates, subject to finance permissions and budget status. Draft aggregates are restricted to users with draft-budget capability.
- The finance scope defines actual as registered costs including unpaid invoices. Payment or reimbursement status does not change actual, and voids remove actual. This is not cash paid from a bank account. See `docs/features/helix-finance-migration/scope.md`, Overview and calculations.
- The finance scope explicitly excludes a verified bank balance and bank reconciliation. No bank-balance source has been identified in the current finance code. Received funding or budget minus spending must not be represented as a bank balance.
- Finance access has separate capabilities. Purchase history, receipts, refund fields, funding sources and scenarios have stricter visibility than budget aggregates. Server responses must enforce any agreed visibility, rather than sending private data and hiding it in the client.

## Agreed behavior

- Place a compact financial section on Season Overview with clearly labelled NOK amounts for season budget, recorded spending, and bank balance. Everyone with Season Overview access can see the approved budget and recorded-spending aggregates and the bank balance. Distinguish budget status and identify the bank figure as a manually entered snapshot with its as-of date.
- Show every department with spending alongside its budget, using an accessible visual comparison with exact amounts in text. Allow the reader to expand each department to see its systems. Explain over-budget and unbudgeted amounts without hiding them.
- The estimated total budget is the current season's planned expense budget, using effective planned amounts from the existing budget. Clearly label a draft where visible and distinguish no budget from a zero budget. Preserve existing draft-budget capability restrictions; the user did not grant broader draft access.
- Show recorded spending as existing actual costs, including unpaid registered invoices and excluding voids. Explain that it does not equal cash paid or bank balance.
- Finance enters and updates the bank balance manually with an as-of date. Show the snapshot and date to Season Overview readers; do not present it as a live or verified bank connection. The amount represents the combined balance across Helix bank accounts.
- Preserve existing project overview content. Provide a link to Financials only where the reader has access.
- Missing, stale, unavailable, or unauthorized financial data must not be displayed as zero. A failure in financial data must not prevent the project overview from loading. Use shared notifications for recoverable failures.
- Use the current season consistently across project and finance data; if those seasons do not match, identify the mismatch rather than combine unrelated values.

## Confirmed decisions

On 29 October 2026, the user chose access for everyone with Season Overview access, a manually entered combined balance across Helix bank accounts with an as-of date, a department breakdown expandable to systems, and the planned expense budget as the estimated total. All users with Financials access may maintain the bank snapshot, as confirmed on 29 October 2026. Private purchase and financing details remain outside this request. Draft budget visibility retains the existing finance capability restriction.

The user confirmed these feature choices, not implementation or deployment. Prepare can resolve the exact editing location, refresh behavior, and presentation of the snapshot using the existing finance permissions and shared UI patterns.

## Boundaries and constraints

- No purchase-level, receipt, refund, funding-source, or other private details are included unless explicitly agreed.
- Do not treat recorded actual as cash paid or calculate bank balance from spending and funding. Historical season selection, forecasting, accounting, bank payments and reconciliation are not requested; keep them out unless the bank-source decision makes a narrower addition necessary.
- Keep partner email OTP separate from Google Workspace member authorization. Use Neon for any new application data and preserve the Vercel function budget. Local validation uses an untracked `.env` or `.env.local`; production deployment requires user authorization.
- The worktree contains unrelated changes. Preserve them.

## Handoff

Prepare should verify the current aggregate calculations, authorization, season mapping and the manual balance workflow, then design the smallest server-authorized read model and any necessary update workflow. The user confirmed the behavior and requested Linear publication and implementation. Deployment remains separately authorized.
