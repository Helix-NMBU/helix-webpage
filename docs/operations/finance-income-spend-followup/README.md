# Finance income and spend follow-up

- `/finance` is named Income & Spend in the page header, sidebar, breadcrumb, and loading state.
- `/finance/budgets` is named Budgets, including department drill-down breadcrumbs and navigation links.
- The Financing table and its capability-gated Manage financing action moved from Budgets to Income & Spend. The purchase register follows it under Spend. Financing reads retain the existing authorization boundary.
- The income and forecast chart remains on Budgets alongside department budget cards. Financing data refreshes on both active pages, including pipeline changes that do not change the Finance view version.
- The Season spending card uses the vertical layout from `codex/internal-finance-budget-fixes` / `4123ec8`, ordered Paid, Unpaid, Total. Totals use integer øre, count registered purchase cost once and exclude voided purchases.
- Old `/finance/financing` links redirect to `/finance`, preserving query and hash through the existing legacy navigation behavior. Funding management remains at `/finance/funding`.

Validation: 86 tests passed across finance composition, totals, routes, freshness, financing income, budget dashboard, Finance access and member navigation. Typecheck and production build passed. Static output is 9.77 MB/10 MB and functions remain 11/11. Browser verified renamed navigation, the vertical totals and Financing table on Income & Spend, the budget chart and department cards on Budgets, and the old Financing redirect. No backend migration, commit, push or release was performed.

## Full-width season summary

The overview now renders a full-width summary directly below its title and description. Season Income shows received, confirmed outstanding and total income, using the same deduplicated confirmed records as the Financing table. Season Spend shows Paid, Unpaid and Total. The duplicate invoice-only breakdown was removed after user review; unpaid invoices remain included in Unpaid. The summary uses available container width to switch between two columns and stacked sections, preventing currency values from clipping beside the sidebar.

Income and purchase capabilities are checked independently. Loading data shows skeletons, not zero balances. Calculation tests cover receipt deduplication, excluded deleted/applied funding, voided costs and invoice/reimbursement distinctions. The full-width layout and narrow-width currency fit were inspected in Safari before the duplicate label removal. Final DOM composition, access and calculation checks passed 37 tests; typecheck and build passed. No deployment was performed.


Release validation on 24 November 2026: the full suite passed with 2,556 tests and three deployment guard tests; 88 tests require other configured environments and were skipped. Frontend, API and runtime API typechecks passed, and the production build produced 9.80 MB with 11 functions. This work is included in the user's authorized main/production release together with the pipeline and local testing improvements.
