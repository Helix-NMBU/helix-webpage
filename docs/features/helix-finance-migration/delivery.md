# Finance follow-up verification

27 November 2026. Local implementation and verification based on deployed main `f6b7195e2dbbb5d8f4e8b8ec710b112e9458fab4`. The bank balance work is deferred. The original working tree has ongoing changes, so the follow-up was integrated in an isolated detached checkout.

## Changes

- Season Overview expands a department into its systems and shows allocation and recorded spend, including unbudgeted amounts. The browser check covered Enter, Space, pointer input, retained keyboard focus and the supported 768 px layout without horizontal overflow. [HELIX-59](https://linear.app/helixnmbu/issue/HELIX-59) and [HELIX-62](https://linear.app/helixnmbu/issue/HELIX-62).
- Register income records confirmed payments with a required source and supports Membership dues, Sales, Donations and Other income. Finance can search and void receipts with an audit history. Confirmed receipts feed the Income & Spend total and the Budgets chart. Season Overview uses its existing sponsor-cash definition. The loopback browser check registered NOK 123.45, attempted a likely duplicate, and voided the receipt with a reason. The received total increased once and returned to its original amount after voiding. A separate NOK 246.80 receipt appeared in the Budgets chart. An attempt to enter the same payment through Manage financing with no receipt date produced a warning and left the total unchanged. The narrow dialog fit the viewport and restored focus on Escape.
- The invoice runner has an opt-in daily and manual GitHub Actions caller on `main`. Transport tests covered missing credentials, redirects and invalid responses. A disposable PostgreSQL 17 rehearsal checked one task/link across concurrent calls, rollback and retry after a partial failure, and rollover without premature task creation. [HELIX-68](https://linear.app/helixnmbu/issue/HELIX-68).

## Milestone evidence

- An ungranted signed-in local profile could not open Finance. The authorized synthetic profile opened the current Finance routes, purchase details and Management’s purchase registration dialog. Escape returned focus to each triggering control. API and component suites exercise identity mismatch, permission denial, revocation and private data handling. [HELIX-35](https://linear.app/helixnmbu/issue/HELIX-35).
- The existing database suites exercised separate PostgreSQL connections for idempotency, approvals, purchases, invoice evidence and migration rehearsal using disposable databases. Real mail and private object storage require configured-service verification.
- Read-only production Neon inspection confirmed the existing core Finance and access migration ledger entries match the repository and Financials and Head of Finance grants are present. The new income table and migration `085_finance_income_receipts.sql` still require an authorized release. Reconcile pending migration filenames before applying database changes, including older ledger entries outside the receipt migration.
- The previous production invoice release recorded successful real Drive checks. This follow-up used loopback fixtures, so configured mail, storage/CORS, recovery and the entire historical four-profile browser checklist remain open. The original spec predates the Financials role gate, project budget packages and removal of the NOK 5,000 rule. The applicable workflow tests use the current behavior. [HELIX-45](https://linear.app/helixnmbu/issue/HELIX-45) and [Drive verification](https://github.com/Helix-NMBU/helix-webpage/pull/146).
- Invoice scheduling requires the production runner and GitHub Actions to share a configured secret, an eligible Finance lead, explicit opt-in, and a successful manual run. This record covers local implementation only.

## Reviewed revision

The independent source review of `7dfe4988db0d86c5c4070329d8981caf26a78c80` cleared the scheduler result-validation fix and duplicate protections for dated and undated manual funding in both submission orders. Confirming separate payments preserves the audit trail.

The frontend, API and runtime API typechecks passed, as did lint and `git diff --check`. A fresh local Vercel build from the reviewed commit produced 9.84 MB of static output and 11 source and generated functions.

The full suite passed 2,686 tests across 283 files, with one skipped test. All three deployment guards passed. The PostgreSQL-dependent Finance checks ran against disposable PostgreSQL 17.
