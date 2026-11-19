# Revision and import UI validation

PBA-03 adds Request changes, one proposed candidate, comparisons against the current approved version, earlier approved-version navigation and project-candidate CSV imports. The season budget board retains read/history views and has no author, approve, edit, cancel/restore or import controls. Production mutations continue through the existing authenticated Finance API and its scoped server permissions.

## Dedicated local workflow

Run the installed dependencies from this checkout with an untracked `.env.local` containing `VITE_MEMBER_PLATFORM=true`:

```sh
./node_modules/.bin/vite --mode member-local --host 127.0.0.1 --port 5294 --strictPort
```

Fixtures require dedicated member-local development mode on loopback and a signed-in local member. No persistent grants or production authorization are changed. Use these URLs on the same origin:

| Role | URL |
| --- | --- |
| Project lead | `http://127.0.0.1:5294/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=project_lead` |
| Responsible department lead | `http://127.0.0.1:5294/departments/mechanical-and-production?tab=budgets&budgetRole=department_lead` |
| Finance | `http://127.0.0.1:5294/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=finance` |
| Head of Finance | `http://127.0.0.1:5294/projects/00000000-0000-4000-8000-000000000100?tab=budget&budgetRole=head_of_finance` |

1. As project lead, create Chassis & assembly's budget and explicitly choose Mechanical & Production. Add Frame tubes, NOK 1,000.00, in the Mechanical & Production system. Submit, approve through the department URL, then approve through the Head of Finance URL.
2. As Finance, select Request changes, provide a reason and submit the request. The approved total remains NOK 1,000.00 and the proposed version starts Draft. Finance has no entry editing/import controls.
3. As project lead, select Import CSV. The dialog lists valid project system codes. For the initial fixture, paste:

   ```csv
   system_id;description;planned_nok;priority
   SYS-2;Frame tubes;1250.25;P1
   SYS-3;Control board;400.00;P2
   ```

4. Preview import. It shows the candidate's additions/changes, old/new values, actuals and proposed total before any write. Import into Draft. The panel compares approved NOK 1,000.00 with proposed NOK 1,650.25 and net NOK 650.25. The matching Frame tubes entry keeps its stable identity and existing optional values.
5. Use Budget version to inspect Approved version 1 and Proposed version 2. Entry editing and review actions are available only while viewing the candidate. The approved version remains available for purchases throughout review.
6. Submit and inspect the same diff as department lead. Approve to Finance. Ordinary Finance can inspect but cannot give final approval. Head of Finance reviews the same comparison and approves. Only then does approved total become NOK 1,650.25.
7. Choose Earlier approved version 1 to inspect the prior plan. Request changes again if needed. A request against an existing candidate reuses its version and resets both approvals; only the project lead edits it.

To rehearse removal, request changes, remove the approved entries, inspect Removed rows and submit the explicitly reviewed zero-plan candidate. Initial budgets still require at least one entry. Removing an entry preserves its allocation identity, purchase facts and invoice references. Active P0 obligations cannot be removed through the fixture mutation/import paths.

Reset only `helix-project-budgets-local-v1` and `helix-project-budgets-local-role-v1` on this loopback origin to start again. Existing workspace data retains its own keys and actual project IDs.

## Verification evidence

Focused client tests cover:

- Request changes by project lead, responsible department lead and Finance, required reasons, candidate reuse and approval reset.
- Full revision/import UI through both reviewers, approved/proposed/earlier version selection and unchanged approved totals during review.
- Exact money and every changed plan field, additions/removals, net totals and exclusion of fulfillment facts from plan changes.
- CSV matching by system and normalized description, retained optional values and stable allocation identity, unchanged re-import, foreign-system/priority validation, changed-source and stale-preview rejection.
- CSV retained through stale save and refresh; durable same-request retries after an uncertain successful import; late preview ignored after session invalidation.
- Reviewed zero-plan revisions and purchased removed entries retaining current actuals, invoices and prior plan history through promotion.
- Legacy season board read-only for every stage even when the session retains old authoring capabilities.
- Existing initial approval, dirty forms, notification recovery, focus restoration, scoped entry points and local-mode boundaries.

The nine-suite focused selection passed 48 tests, client typecheck passed, and the source route guard remained 11/11. Backend transaction, authorization and independent-connection races are verified separately by the owning backend worker. Fixtures do not establish real database or configured service acceptance.

Native CUA discovery found no isolated browser provider in this worker. The available Dia window showed the user's active timed game, so no UI actions were taken. Its CUA completion summary was issued. Root's isolated IAB is assigned the browser journey and screenshot capture above; this document does not claim a browser result before that observation. No grant editing was attempted in this slice.

## Purchase integration

PBA-05 provides its standalone purchase/completion component. The panel marks its insertion point after the entry total. Render it whenever `detail.capabilities.canRegisterPurchase`, irrespective of which version is displayed; it owns the effective approved-entry selection. Its refresh callback calls the panel's `load(true)`. Root separately adds unbudgeted registration for an authorized scope without a budget header. Revision/import code does not duplicate those purchase rules.
