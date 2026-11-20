# Project budget verification

Approved specification: revision 2, decisions D1–D16. This record distinguishes executable fixture evidence from configured-service acceptance. The final reviewed commit and PR checks will be added after package integration.

## Current evidence

| Case | Evidence | Remaining acceptance |
| --- | --- | --- |
| V-01 — scoped roles | Real identity/linkage, project author, current department lead, Finance and explicit Head of Finance tests; actual074 department Home reader tests use ordinary membership with no broad Finance grant. Bounded reader/widget review found no actionable findings at f1b8fd4, wiring checked at3ba1b1b. | Final package/UI changes and complete review. |
| V-02 — whole package | Initial074 lifecycle suite passes12 cases on integration, including two projects, unfinished projects, direct approval denial, replay and whole-package reset. Existing PostgreSQL approval regression passes5 cases using real packages. | Final package race hardening, stale legacy transition, two-project browser walkthrough. |
| V-03 — revisions | Existing revision/import and purchase tests now use genuine package actions. Five PostgreSQL suites pass35 cases; purchases retain their recorded approved version in both promotion orders, unchanged plans survive actual/header changes, optional requests recheck after anchor waits. | Final owner-view and package hardening integration, grouped browser diff. |
| V-04 — threshold removal | PBA-04/05 verified the retired threshold across SQL, forms, mail, export and pre-budget actual registration. Existing incurred-cost and review provenance regressions remain. | Final full-suite/CI confirmation. |
| V-05 — partial fulfillment | PBA-05/08 tests and local browser evidence cover partial actuals, explicit complete/reopen, linked void, immutable exception facts and independent invoice/outlay obligations. Local invoice payment predicate matches documentKind invoice OR paymentMethod invoice. | Final integrated regression confirmation. |
| V-06 — invoice storage | Durable invoice PostgreSQL suite passes21 cases after package fixture conversion. Earlier Drive fault and private staging tests cover confirmation, retry, uncertain create reconciliation, exact bytes, revocation and cleanup. Local recovery retains dirty reason input and does not duplicate purchases. | Real configured Drive credential/folder/narrow scope/reader ACL and authorized small/large/multiple-file acceptance remain release gates. No live writes were performed. |
| V-07 — funding/P0 | Funding fixtures use real package approvals. Award/release, multiple obligations, rejected removal, proposal adoption and current approved ordinary priority were verified in PBA-07/08. Real042 wrapper plus073 owner repair passes4 migration/pipeline cases at95950dc. | Final package whole-union and owner-view checks, complete review. |
| V-08 — totals/mapping | Synthetic PostgreSQL migration rehearsal passes through066–074: dry run changes no Finance table; duplicate mapping remains visible; real adoption/reviews switch legacy10,000 to project12,000 once; unmatched5,000 stays legacy; all original historical rows survive; registered actual2,000 excludes void. Home exact-money and cross-system ownership tests use actual074. | Final canonical Finance/Season owner read adapter and cross-department transition validation. |
| V-09 — rendered UI/CI | Earlier project, purchase, invoice, funding, Finance and Season interfaces inspected locally. Department Home atf1b8fd4 showsNOK8,900.75 for Mechanical & Production under its project, including an Electronics system. CSS768 has no document overflow; normal project link works. Screenshots saved outside repository. | Package readiness/send/return/approve walkthrough, supported narrow package layout, exact final full tests/build/reviews/CI. |

The counts above overlap other test runs and must not be added as an overall feature test count. Earlier ticket evidence is recorded in delivery.md with its applicable commits. Final test results supersede these checkpoints for changed code.

## Migration rehearsal

`test/api/_lib/project-budget-migration-rehearsal.postgres.test.ts` creates its own uniquely named database through the loopback postgres maintenance database, seeds historical registered/voided purchases, private evidence, an imported paid invoice with null requester and an approved request/commitment, then loads actual additive feature migrations. It never targets configured application data.

The dry run compares complete JSON rows of every Finance table before and after both valid and conflicting manifest previews. Application uses the actual lead authoring endpoint, department preview/send and Head of Finance package decision. The resulting effective plan contains exactly three stable anchors and17,000 total, with one replaced project plan and one unmatched legacy plan. Every pre-migration historical row retains its original fields; additive columns and new audit events are permitted. Source budget amounts are not overwritten by project promotion.

This is a synthetic rehearsal. Before live adoption an operator must supply and approve the real same-season entry-to-project/department manifest and ordinary priorities for adopted legacy EM entries. Unmatched records must remain explicit.

## Final command gates

Run against the completed integration commit:

```sh
npm run typecheck
npm run typecheck:api
npm run typecheck:api:runtime
npm run lint
FINANCE_TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55475/postgres npm test
npm run build
node scripts/check-vercel-functions.mjs
```

The existing ESLint config covers JS/JSX only; a passing lint command does not establish TypeScript lint coverage. TypeScript is checked by the three compiler commands.

Build the generated deployment locally in the isolated compiler checkout with its own dependencies, then inspect generated functions against the at-most-11 budget. The integration checkout currently contains older generated output, so its printed generated count is not final-build evidence. No hosted staging or deployment is part of validation.

The Finance PostgreSQL GitHub workflow selects the `test/api/_lib/project-budget` prefix and explicit purchase/invoice/concurrency suites. Its loopback PostgreSQL service must execute the new package and migration rehearsal cases; environment-skipped races do not meet acceptance. Required checks must apply to the final PR head or applicable test merge commit.

## Release inputs

- Approved real mapping manifest and responsible departments, preserving unmapped history.
- Actual Drive/folder, dedicated service identity, effective narrow scope and reader ACL acceptance.
- Actual Finance approver grants using current verified Google Workspace authorization.
- Separate user authorization for merge, production migration and deployment.

These inputs do not prevent local implementation or an accurately described unmerged code PR. Mocked transfers and synthetic identities do not establish configured-service acceptance.
