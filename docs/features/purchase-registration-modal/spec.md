# Purchase registration and invoice tasks

The user approved these changes in this chat and authorized committing and pushing them to main on 23 November 2026.

- Remove Sponsor funding reviews from navigation. Keep Finance access restrictions and its funding reconciliation functionality.
- Name the existing Financials space Finance, retaining the `financials` permission key.
- An invoice task can complete only after an invoice sent date and full payment received date are recorded. Finance authorizes payment receipt. Preserve previously completed task history.
- Remove the Purchases page. Redirect its old URLs through Management.
- Show a small receipt icon and text action at the far right beneath the content inset, only for Management members and leads. The action opens a registration modal.
- Keep the modal focused on purchase details and evidence. Show conditional reimbursement/invoice fields and optional project/budget and additional details. Preserve input on errors and cancellation.
- Allow registration without a project. Let a Management member link that original purchase to a project they lead later.
- Project options contain cube icons. After project selection, list its approved budget entries as checkboxes. One payment can cover multiple entries. Require positive allocations that sum exactly to the payment, while keeping one purchase and one receipt set.
- Reuse current approved project-budget versions and existing evidence transfer/recovery workflows. Registration creates actual costs, not budget approvals.
- Use pointer cursors for interactive internal controls, while preserving text, drag, resize, and disabled cursor behavior.
- Restrict development fixtures to the dedicated loopback member mode. Keep real authentication and narrow authorization in production.

The implementation is based on current main, commit `614ab9a`. It includes migrations `078_partner_invoice_progress.sql` and `079_management_purchase_registration.sql` after the existing project-budget and invoice-storage migrations. Apply them using the repository's migration ledger before using the new API operations.
