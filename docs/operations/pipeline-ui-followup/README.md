# Pipeline editing and purchase links

The pipeline uses a compact create dialog and a right-hand details sheet. Contact name and email save individually on blur or Enter. Dates use the shared calendar picker. Assignees use the existing avatar and name control. Routine pipeline saves are silent; failures and conflicts use the shared notifications.

Sponsor levels and confidence retain their colored pills in the selected control and its choices. Choosing a tier adds the existing season-specific presets once, preserving custom deliverables and avoiding duplicate titles. Deliverables appear as a simple list inside the selected package, with custom items under Add-ons. The plus control adds an add-on, and each item can be removed. Removed presets stay removed until another tier selection explicitly applies defaults. Existing descriptions, owners and deadlines remain stored for the agreement handoff.

Partner contribution notes are independent of cash and in-kind valuations. Migration `081_partner_contribution_notes.sql` adds the notes column and retains the established save authorization, revisions and Won locks. Existing contribution descriptions provide the initial notes until edited. Working notes remain private to the pipeline.

Linked budget entries opens a large modal with search, department filtering and a selected-only view. Entries are grouped by project and show their planned value and priority. Selection is preserved across search and department changes. The modal provides multiple selection for approved and submitted budget entries across projects in the deal/application season. Department names come from the entry system, with the responsible project department retained for unavailable historical links. Selecting entries creates or updates existing funding-application obligations. Deselecting before Won retains release history. Once a deal is Won or a grant is Approved, the selected entries become P0 through the existing effective-priority and obligation protection rules. Their ordinary priorities and approved amounts are preserved. Pending purchases remain unapproved until the normal budget review completes. Budget links are locked after confirmation or an explicit Finance award.

Migration `082_pipeline_budget_links.sql` supplies the limited pipeline projection and atomic link selection, and wraps the established Won operation. It locks budget headers in Finance's order, rechecks current pipeline authorization and revision snapshots, and activates priorities only after the agreement handoff succeeds. Request IDs support safe retries. The existing Finance award and release controls remain available to their authorized roles.

Migrations 081 and 082 were applied atomically to Neon production on 24 November 2026 for the authorized release, with both checksums recorded in the existing migration ledger. The full repository schema chain has been rehearsed on the existing Neon staging branch inside a rolled-back transaction, including denial of unauthenticated notes writes and budget-choice reads. The existing staging schema and records were preserved; no additional branch or account was created. Staging has no currently authorized pipeline member, so save and Won behavior is exercised in isolated database service tests. Local browser checks use the dedicated loopback development mode.

## Validation

The following checks pass with exit code 0:

- `npm run typecheck`
- `npm run typecheck:api:runtime`
- `npm run typecheck:api`
- `./node_modules/.bin/vitest run test/api/_lib/partner-budget-links.test.ts src/features/Finance/FundingApplications.test.tsx src/features/PartnerDeals src/libs/components/ui/date-picker.test.tsx test/api/_lib/partner-deals-foundation.test.ts test/api/_lib/partner-won-finance-integration.test.ts test/api/_lib/project-budget-funding-applications.test.ts --maxWorkers=2`
- `npm run build` — 9.76 MB static output, 11 serverless functions.
- `node /private/tmp/helix-partner-notes-staging-check.mjs` — migration rehearsal and authorization denial checks in a rolled-back staging transaction.

Browser checks covered selected tier/confidence pills, package lists, and the Linked budget entries modal with 64 entries across projects, department filtering, purchase search, keyboard selection, dismissal and focus restoration. Database and local repository tests cover pre-Won priorities, Won/Approved promotion, unaffected purchases, preserved ordinary priorities, pending money, stale writes, release history, repeated confirmation and revoked access.

## Modal follow-up validation

`./node_modules/.bin/vitest run src/features/PartnerDeals/LinkedPurchases.test.tsx src/features/Finance/FundingApplications.test.tsx src/features/PartnerDeals/Pipeline.test.tsx test/api/_lib/partner-budget-links.test.ts --maxWorkers=2` covers the modal, cross-department selections, search, selected-only filtering, Escape/focus restoration and entry-level department projection. The frontend/API typechecks and production build pass; deployment output remains 9.76 MB and 11 functions. The updated department projection is included in the rolled-back staging migration rehearsal.


Grant and P0 confirmation follow-up:
- Grants omit negotiation notes, partner contribution notes, and sponsor level in the creator, side panel, and conflict review. Stored historical notes are preserved.
- Linked budget entries provides Manage links before confirmation and a read-only view once locked. Deselect an entry and Apply to unlink it before Won/Approved. Existing Finance awards and closed-season locks remain enforced.
- Won/Approved review loads the current budget links, lists each linked entry and its P0 outcome, and requires a checkbox acknowledgment before confirmation. Failed or stale reads block confirmation and provide a notification recovery action. Cards without linked entries use the normal confirmation. Creating a new card directly in Won/Approved still requires its existing review before writing.
- Browser checked grant fields, renamed selector, acknowledgment gating, cancellation and focus restoration using the local synthetic grant. No approval was submitted and no links were changed.

Validation for this follow-up: 75 tests passed across Pipeline, LinkedPurchases, DealComposer, FundingApplications, and partner-budget-links. Typecheck, production build, and diff whitespace checks passed. Static output 9.76 MB/10 MB and 11/11 function target. ESLint does not currently match these TSX files, so it was not counted as lint validation.

Pipeline navigation follow-up: Deals and Grants are separate outlined pills using the shared Radix tabs. The header New deal/New grant action is removed; per-column + controls remain the entry point for creation. Verified the rendered pills and switching locally in Safari.

Stage totals follow-up: every column has a bottom-aligned NOK cash total for the cards in the selected Deals or Grants view. Uses integer øre and the same active cash contributions as the card value, across seasons; ignores product/service estimates, retired contributions, and unset amounts. Empty columns show NOK 0,00. Pipeline suite: 46 tests passed; typecheck and whitespace check passed. Browser verified populated and empty column footer totals.

Grant value follow-up: grant value controls, accessible labels and empty placeholders use Grant value. Grants omit the In-kind value editor and do not use in-kind estimates as card or side-panel value fallbacks. Historical stored contributions are preserved. Creator and pipeline suites passed 54 tests; typecheck and local browser check passed.


## Column scrolling and filters

The pipeline uses the workspace viewport height. Each column keeps its header and cash total outside its independently scrollable card list. Cards have a fixed 160px height and cannot shrink when the column fills. Titles are limited to two lines, and long season labels truncate within the card. Card lists are keyboard focusable. The card-level Follow up text is removed; the date remains editable in the details sheet.

Horizontal wheel or trackpad gestures anywhere in the pipeline move the board, including over cards, column headers and totals. Shift+wheel also moves horizontally. Vertical gestures within a column move only that column's card list. Pinch/zoom modifier gestures retain their native behavior. A native non-passive wheel listener routes the gesture once without a second nested native scroll; shared BoardTransfer continues to provide dragging and keyboard movement.

The top-right Filter popover provides confidence, sponsor level, and assignment (all, assigned to me, or unassigned). Filters combine. Sponsor level applies only to Deals and is ignored in Grants. Column counts and Value totals reflect the visible cards. Clear filters restores all entries. Shared Radix controls provide selection, dismissal and focus restoration.

Validation: 98 tests passed across Pipeline, pipeline-filters, use-pipeline-scrolling and MemberPlatform. Frontend typecheck and production build passed; output is 9.78 MB with 11 serverless functions. Tests cover gesture routing, modifier handling, combined filters, unassigned/mine selection, grant filtering, Escape/focus restoration and the existing pointer/keyboard board flows. Current browser verification could not be completed because the preview connection repeatedly timed out; the latest scrolling and fixed-height layout have not been visually verified. Changes remain local and are not deployed.


Scrollbar and filter alignment follow-up: column card lists now use UI SDK ScrollArea with `type="scroll"` and a 900ms hide delay. The thumb fades over 300ms, with reduced-motion support; hover alone does not reveal it. The SDK retains native wheel, touch and keyboard scrolling and provides thumb dragging. The existing cross-axis pipeline gesture routing targets the ScrollArea viewport. The filter action is icon-only with an accessible name and active-filter count, aligned on the same row as the Deals and Grants pills.

Validation: Pipeline and gesture suites passed 50 tests, including hidden-at-rest/hover behavior, per-column visibility, continued-scroll delay renewal, and idle hiding. Typecheck and build passed. Browser verification remains blocked by the in-app preview CDP timeout.


Horizontal scrollbar follow-up: the board now uses the same UI SDK scroll-only visibility, 900ms idle delay and 300ms fade as column scrollbars. The BoardTransfer root renders the native ScrollArea viewport, retaining keyboard and pointer card movement, cross-axis wheel routing and independently scrolling columns. Vertical column scrolling does not reveal the horizontal scrollbar. The page heading and description are removed to give the columns more height.

Validation: 51 Pipeline and gesture tests passed, including horizontal visibility at rest/on hover, wheel routing, independent axis visibility and idle delay renewal. Typecheck and build passed. Visual checking remains unavailable through the preview connection; native Codex app access was also denied by the computer-use tool. Changes remain local.


## Production release validation — 24 November 2026

The user authorized committing, pushing and merging this work into main for production. `VITE_MEMBER_PLATFORM=false npm test` passed: 2,556 tests passed and 88 skipped across 263 passing and 14 skipped files, followed by three passing deployment guard tests. The local preview flag must be disabled for the legacy member-landing test router. Frontend, API and runtime API typechecks passed. The production build passed with 9.80 MB static output and 11 functions.

The complete migration chain was rehearsed on the existing Neon staging branch in a rolled-back transaction. Production's 82 prior ledger checksums matched the repository. Migrations 081 and 082 were then applied in one transaction under the schema advisory lock, including ledger inserts. Member, deal, contribution, deliverable, project budget, budget obligation and funding-application counts were unchanged afterward. No test accounts or fixtures were added to Neon. Earlier local browser checks remain recorded above; the latest layout could not be visually rechecked because preview access was unavailable.
