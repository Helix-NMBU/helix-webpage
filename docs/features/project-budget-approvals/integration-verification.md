# Project budget verification

Approved specification: revision 2, decisions D1–D16. Final product code: `36b41f869379c767b552a62438265a8928fd16c5`, reviewed against `b05c5a457a378a76aaba7535ab6c0664505cf089`. Local implementation acceptance is complete. PR-only CI and merge readiness are recorded separately below and in delivery.md.

## Final local evidence

| Case | Verified behavior | Evidence |
| --- | --- | --- |
| V-01 — scoped roles | Current verified identity, assigned project leads, responsible department leads, Finance and explicit Head of Finance; ordinary department members receive only their approved Home aggregate. Foreign/revoked access is denied. Private Draft amounts, entries and raw audit snapshots are excluded from unrelated Finance, including funding paths; legitimate role overlap remains. | Actual 066–074 authorization/privacy suites; local dirty-editor revocation tests. Browser Finance saw approved 9,750.75 without the private Draft 100,749.25 or private description/note; assigned lead retained it. |
| V-02 — whole package | Missing/Draft readiness, fixed multi-project snapshots, one atomic Head decision, individual bypass denial, stale/current-owner/legacy-transition checks, whole-package reset, real pre-074 pending migration and retry safety. | Actual 074 lifecycle and PostgreSQL races, late-fault rollback with an outside observer and same-request retry. Browser sent with No budget, withdrew with reason, then approved two projects together for 10,500.75. |
| V-03 — revisions | New/Changed/Removed old/new comparisons, removed history, unchanged approved context, both reviews again, previous approval usable during revision. Purchases do not invalidate an unchanged plan merely by bumping headers. | Revision/import suites and both PostgreSQL purchase/promotion orders; browser retained 8,500 actual and three invoices through promotion. Native comparison disclosure keyboard/pointer checks. |
| V-04 — threshold removal | NOK 5,000 rule removed across active purchase forms, SQL, mail and exports; incurred exceptions retain actual facts and Finance review provenance. | Dedicated threshold PostgreSQL suite, retained purchase/service/export tests and full suite. |
| V-05 — partial fulfillment | Partial purchases, reasoned completion/reopening, linked voids and immutable exception facts; invoice payment and outlay reimbursement remain independent. | Real PostgreSQL purchase/concurrency and local register/recovery suites; browser invoice obligations and unchanged purchase totals. |
| V-06 — invoice storage | Verified private staging, durable transfer continuation, exact bytes, uncertain-create reconciliation, retry without duplicate purchase, current-owner evidence access and preserved historical providers. | Drive fault/private staging tests, real PostgreSQL durable invoice suite, browser truthful unavailable legacy-file and needs-attention recovery with dirty input retained. Actual configured Drive acceptance remains a release gate. |
| V-07 — funding/P0 | Award-derived P0, multiple obligations, only Head reasoned release, proposal adoption through both reviews, complete final replacement union and current approved ordinary priority. | Funding/pipeline suites load actual 042 and 066–074; final-union PostgreSQL approval and rollback cases; local application/proposal/award/release walkthrough. |
| V-08 — totals/mapping | Whole project assigned once to selected responsible department across physical systems; preheader actuals follow later current owner while recorded purchase identity survives. Shared protected actuals partition once; minimal Season and exports agree. | Actual allocation/effective-finance suites and synthetic mapping rehearsal below; Home exact-money and approved-zero coverage. |
| V-09 — rendered UI/CI | Project, department readiness/send, Finance grouped review, purchases/invoices/funding, Season and Home inspected locally. Desktop and supported CSS 768 layouts are readable, with local table scrolling, native focus/dismissal and shared notification recovery. Home shows 10,500.75 split 9,750.75/750 and excludes unfinished Drafts. | Screenshots outside Git in the existing visualization directory. All local commands and three independent review axes pass; PR CI remains the final publication gate. |

Counts from focused runs overlap and must not be added. The final full root run at `1c45774` passes 240 files and 2,341 tests, with one optional `ATTIO_IMPORT_SNAPSHOT` skip; all Finance and partner PostgreSQL cases execute. Log: `/private/tmp/helix-pba-final-integrated-tests.log`. The only subsequent product change, `36b41f8`, replaces Object.hasOwn with equivalent Object.prototype.hasOwnProperty.call for the deployment compiler's library target. Scoped purchase read and both API typechecks pass; independent reviewers cleared the exact final commit.

## Independent review

All reviewers inspected source and meaningful tests; they did not rerun runtime commands. Root owns the execution evidence.

- Complete correctness/regression/failure-path/security: `/root/correctness_review`, clear at 36b41f8 against b05c5a4. All reported defects repaired and independently cleared.
- Standards axis: `/root/standards_review`, zero actionable findings at the same base/head.
- Spec axis: `/root/spec_review`, zero actionable findings at the same base/head, including revision 2/D16 and final Draft privacy.

Earlier provisional checkpoints in delivery.md remain historical and do not override this final result.

## Migration rehearsal

`test/api/_lib/project-budget-migration-rehearsal.postgres.test.ts` creates its own uniquely named database through the loopback postgres maintenance database, seeds historical registered/voided purchases, private evidence, an imported paid invoice with null requester and an approved request/commitment, then loads actual additive feature migrations. It never targets configured application data.

The dry run compares complete JSON rows of every Finance table before and after both valid and conflicting manifest previews. Application uses the actual lead authoring endpoint, department preview/send and Head of Finance package decision. The resulting effective plan contains exactly three stable anchors and17,000 total, with one replaced project plan and one unmatched legacy plan. Every pre-migration historical row retains its original fields; additive columns and new audit events are permitted. Source budget amounts are not overwritten by project promotion.

This is a synthetic rehearsal. Before live adoption an operator must supply and approve the real same-season entry-to-project/department manifest and ordinary priorities for adopted legacy EM entries. Unmatched records must remain explicit.

## Final command gates

- All three package TypeScript checks pass. Repository lint passes; its existing configuration covers JS/JSX only, while the compilers check TypeScript.
- Full `FINANCE_TEST_POSTGRES_URL=postgresql://postgres@127.0.0.1:55475/postgres npm test` passes as recorded above. Deployment guard Node tests also pass 3/3.
- Final local Vercel build on 36b41f8 passes in `/private/tmp/helix-pba-compiler`, with separate dependencies and explicit existing project context. Static output 9.20MB/10MB, source 11/11 and freshly generated 11/11 functions. No TypeScript diagnostic remains. Log: `/private/tmp/helix-pba-final-vercel-verified-build.log`.
- Compiler installs use the unchanged repository lockfile via `npm ci`. Vercel's function packaging removes optional peer lock entries in that isolated checkout; no dependency or lockfile change is integrated into the feature.
- Feature-only diff inspected; no screenshots, environment files, credentials, generated deployment output or unrelated working-copy changes are included. Original approved artifact hashes remain preserved. Whole-branch diff whitespace notices are original document EOF blanks and intentional fixed-width PDF xref spaces, rather than accidental product whitespace.

The Finance PostgreSQL GitHub workflow selects the `test/api/_lib/project-budget` prefix and explicit concurrency/threshold/invoice suites, including real 074 package and migration rehearsal cases. It provides its own loopback PostgreSQL17 service. Required verify and this Finance job must pass on the current PR head or applicable test merge commit; skipped real races do not meet acceptance.

No hosted staging, live Finance migration, invoice service write or deployment was performed. An unlinked compiler command briefly created an empty temporary Vercel project; it was stopped, verified to have zero deployments and removed. The production Helix project was unchanged. Subsequent local build explicitly verified and selected the existing project before execution.

## Release inputs

- Approved real mapping manifest and responsible departments, preserving unmapped history.
- Actual Drive/folder, dedicated service identity, effective narrow scope and reader ACL acceptance.
- Actual Finance approver grants using current verified Google Workspace authorization.
- Separate user authorization for merge, production migration and deployment.

These inputs do not prevent local implementation or an accurately described unmerged code PR. Mocked transfers and synthetic identities do not establish configured-service acceptance.


## PR evidence

Single [PR #144](https://github.com/Helix-NMBU/helix-webpage/pull/144), base main atb05c5a4, final reviewed product36b41f8. Documentation-only publication does not change product review applicability. GitHub's live head/check/merge state and the [HELIX-84 verification closure](https://linear.app/helixnmbu/issue/HELIX-84/pba-09-rehearse-migration-and-verify-the-integrated-feature) record the exact final CI outcome after this publication checkpoint. Required verify must pass with strict current-base freshness; the real Finance PostgreSQL job must also pass without skipped race coverage. The PR remains unmerged, and HELIX-75 remains open until merge.
