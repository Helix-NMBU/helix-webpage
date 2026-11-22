# Local season scenario

Start the dedicated member-local server, sign in, and open `/finance/budgets?financeScenario=season&memberRole=default&financeRole=head_of_finance&budgetRole=head_of_finance` on loopback. The explicit initializer runs before workspace providers mount and only once per browser storage. Revisiting the URL preserves subsequent edits.

The initializer adds 16 projects, 15 budgets, 48 tasks and 31 purchases across all seven departments. Fourteen project budgets are approved, totaling NOK 2,192,000 before existing allocations. Dated received funding totals NOK 1,860,000 from August through November 2026. A further NOK 250,000 secured and NOK 180,000 applied are excluded from the income line.

| Department | New approved allocation |
| --- | ---: |
| Management | NOK 245,000 |
| Mechanical & Production | NOK 590,000 |
| Electronics | NOK 390,000 |
| Software & Autonomous | NOK 335,000 |
| Business & Marketing | NOK 145,000 |
| Logistics | NOK 361,000 |
| Finance | NOK 126,000 |

Electronics has a pending package of NOK 397,000 with changed, removed and new entries. Logistics has a pending package of NOK 379,200. Software has an unsubmitted revision. Community events has a draft budget; Facilities planning has no budget. Approved allocations remain usable during revisions.

Purchases include partial and completed orders, paid and unpaid invoices, an overspend and an unbudgeted cost for Finance review. Two awarded safety obligations become P0 when the account already has local Pipeline access. The initializer preserves saved space grants and role selections. Synthetic members receive local department memberships needed to exercise the workflows.

No services are contacted. Invoice references use the local repository and show transfer attention because no shared Drive upload took place. Production builds omit the initializer. Runtime checks also require signed-in development mode on loopback.

Existing projects, budgets, purchases and funding are retained. Original values of the seven touched data stores are backed up under `helix-finance-season-scenario-backup-v1`; completion is recorded under `helix-finance-season-scenario-v1`. Failures restore the original stores and role selections. Do not remove only the completion marker and rerun over partial fixtures. Keep the backup if an explicit rollback is needed.

Validation on 22 November 2026: six scenario tests passed, including idempotency, rollback and prevention of external requests. Type checking, lint, production build and all 592 Finance/MemberPlatform tests passed. Production output contained neither the scenario marker nor its initialization code. Browser checks confirmed NOK 2,202,500.75 total approved including existing allocations, NOK 1,860,000 received, populated department cards and the Electronics package diff.


For dated pipeline forecasts, open `/finance/budgets?financeScenario=forecast&memberRole=default&financeRole=head_of_finance&budgetRole=head_of_finance` in the same local mode. This separately adds three cash opportunities once, retaining existing deals and receipts: High confidence NOK 180,000 in seven days, Medium NOK 120,000 in fifteen days and Low NOK 100,000 in twenty-four days. Original pipeline storage is retained under `helix-finance-pipeline-forecast-backup-v1`. The 30-day Realistic, Moderate and Optimistic projections add High, High + Medium and all confidence categories respectively; eligibility uses planned invoice dates. Each forecast is drawn as one straight segment from current receipts to the 30-day cumulative total. Confidence labels retain the existing storage category values 100, 75 and 25, without applying percentage weights. Received or deleted linked funding and retired/cancelled/lost opportunities are excluded.
