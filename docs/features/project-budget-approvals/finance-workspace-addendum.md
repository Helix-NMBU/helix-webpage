# Finance workspace refinements

Direct user instructions, 21–22 November 2026. These refine approved specification revision 2 and addenda D16–D19. Original approval and publication hashes remain unchanged. The user authorized committing all feature changes, updating the existing PR, independent code review, fixes and merging on 22 November. Production migrations and Drive configuration remain separate.

## Navigation and budget review

- Finance has Home, Tasks and Projects alongside Spending and Budgets & Financing. Budgets and financing share one page; Spending lists registered purchases. Remove the old page-switch buttons.
- Budgets & Financing shows a season income chart and compact department allocation cards. Each card links to its department budget detail, with the detail after Budgets & Financing in the breadcrumb.
- Pending budget changes have a yellow Changes requested pill in both themes. Approved budgets need no change notification.
- Department detail uses one compact department-wide chart and collapsible projects. Highlight changed projects with a Changes requested pill, without a yellow outline. Show requested change in a yellow pill in each collapsed project header, without repeating requested total.
- Entry rows show New and Removed directly, without Previous: None. Changed rows use a Change column, Previous amount and Amount change, with clear property differences. Remove the Systems column. Separate Fulfillment and Invoice. A horizontal divider precedes each project's amount-change summary row.
- Review changes sits inside the expanded project at bottom right below its summary. It opens the existing department-package review; final approval still covers the complete fixed department package. Remove redundant department-history and readiness buttons at the bottom.

## Income, forecasts and financing

- Received income alone forms the August-to-August cumulative season line. Use shared shadcn chart components and Recharts. Smooth historical income and mark its current endpoint; draw each forecast as one dashed straight segment from that endpoint to its 30-day endpoint.
- Thresholds use approved budgets only: Baseline is P0 and P1; Level 1 is Baseline + P2; Level 2 is Level 1 + P3; Level 3 is Level 2 + P4. Reached chart thresholds and level pills are green, with subdued unreached threshold lines. Keep widget text neutral and omit Income goal reached. Retain the clear next-level amount still needed.
- Forecasts use planned invoice dates and cumulative confidence scenarios: Realistic includes High, Moderate includes High and Medium, Optimistic includes all three. Replace Probability controls with Low, Medium and High confidence. Forecast colors differ from received-income blue. Remove the old chart header, received total, timeline link and approved-goals helper text.
- Financing replaces Funding records and bank balance and the Season budget editor on this page. List money-in sources and won opportunities. Source is the deal/grant name, with organization secondary.
- Pipeline offers Deals and Grants. Won cash deals generate the existing invoicing task; grants do not. Completed invoicing tasks determine Invoice sent. Deal financing status is Ready to invoice, Invoice sent or Received. Approved unpaid grants show Awaiting payment; paid grants show Received. No redundant Invoice sent column.
- Existing funding correction, creation, restoration and earmark operations remain available to authorized users through Manage financing, a secondary page linked from the compact Financing section. Reconciliation correction links use that page.

## Spending and invoice corrections

- Use a simple purchase table, one row per purchase, with Project replacing Supplier. Add Department and Project filters. Over budget and Unbudgeted reasons are explicit red pills. Keep other approval problems distinguishable.
- Simplify the purchase side panel to key details, invoice access and payment controls, with secondary evidence/history on demand. Preserve payment, reimbursement, voiding and review workflows.
- Confirmed Drive evidence shows View invoice. Missing evidence shows Invoice not found for readers, or Link to invoice for authorized Finance on registered purchases. The modal accepts a Google Drive file URL and retains existing Drive permissions.
- Finance can correct a linked invoice through Edit link next to View invoice in the table and purchase details. Prefill the current URL. Save with expected purchase revision and request idempotency. Reauthorize writes and opens; audit old and new URLs. The corrected reference takes precedence in normal invoice links while original uploads and transfer history remain intact. Linking must not change costs, payments, reimbursement or fulfillment.
- A compact Season spending widget sits on the right of the Spending page heading at the same vertical level on a wide screen. It shows Paid and Paid + unpaid for the complete season, independent of filters. Exclude voided purchases and count each registered cost once, even where invoice and reimbursement obligations coexist. Give totals enough space and adapt to narrower content widths.

## Local verification

Use the dedicated signed-in loopback mode for test profiles and season/forecast fixtures. Preserve production authentication and authorization. Synthetic fixtures never establish actual Drive file existence, Drive reader access or production acceptance. See local-season-scenario.md for initializer boundaries and rollback data. Run relevant tests, all type checks, lint, build and the function budget guard before merge. Record final evidence and review findings in delivery.md.
