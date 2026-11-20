# Project budget verification

Approved specification: revision 2, with direct user addenda D16 and D17. Current product `cf17e124491497c4c7d91b271c546e5ec43ccb7d` and fixture-only follow-up `54fa2ea45ed8af3b9ef58f42f0cd08b22e575afb` are independently reviewed against `b05c5a457a378a76aaba7535ab6c0664505cf089`. The baseline evidence below is preserved. The latest D17 section and delivery.md record current verification; GitHub and HELIX-84 record final PR-head CI/readiness.

## Baseline local evidence

| Case | Verified behavior | Evidence |
| --- | --- | --- |
| V-01 — scoped roles | Current verified identity, assigned project leads, responsible department leads, Finance and explicit Head of Finance; ordinary department members receive their approved Home aggregate, and D17 adds approved-only project allocations for current assigned project members. Foreign/revoked access is denied. Private Draft amounts, entries and raw audit snapshots are excluded from unrelated Finance, including funding paths; legitimate role overlap remains. | Actual 066–074 authorization/privacy suites; local dirty-editor revocation tests. Browser Finance saw approved 9,750.75 without the private Draft 100,749.25 or private description/note; assigned lead retained it. |
| V-02 — whole package | Missing/Draft readiness, fixed multi-project snapshots, one atomic Head decision, individual bypass denial, stale/current-owner/legacy-transition checks, whole-package reset, real pre-074 pending migration and retry safety. | Actual 074 lifecycle and PostgreSQL races, late-fault rollback with an outside observer and same-request retry. Browser sent with No budget, withdrew with reason, then approved two projects together for 10,500.75. |
| V-03 — revisions | New/Changed/Removed old/new comparisons, removed history, unchanged approved context, both reviews again, previous approval usable during revision. Purchases do not invalidate an unchanged plan merely by bumping headers. | Revision/import suites and both PostgreSQL purchase/promotion orders; browser retained 8,500 actual and three invoices through promotion. Native comparison disclosure keyboard/pointer checks. |
| V-04 — threshold removal | NOK 5,000 rule removed across active purchase forms, SQL, mail and exports; incurred exceptions retain actual facts and Finance review provenance. | Dedicated threshold PostgreSQL suite, retained purchase/service/export tests and full suite. |
| V-05 — partial fulfillment | Partial purchases, reasoned completion/reopening, linked voids and immutable exception facts; invoice payment and outlay reimbursement remain independent. | Real PostgreSQL purchase/concurrency and local register/recovery suites; browser invoice obligations and unchanged purchase totals. |
| V-06 — invoice storage | Verified private staging, durable transfer continuation, exact bytes, uncertain-create reconciliation, retry without duplicate purchase, current-owner evidence access and preserved historical providers. | Drive fault/private staging tests, real PostgreSQL durable invoice suite, browser truthful unavailable legacy-file and needs-attention recovery with dirty input retained. Actual configured Drive acceptance remains a release gate. |
| V-07 — funding/P0 | Award-derived P0, multiple obligations, only Head reasoned release, proposal adoption through both reviews, complete final replacement union and current approved ordinary priority. | Funding/pipeline suites load actual 042 and 066–074; final-union PostgreSQL approval and rollback cases; local application/proposal/award/release walkthrough. |
| V-08 — totals/mapping | Whole project assigned once to selected responsible department across physical systems; preheader actuals follow later current owner while recorded purchase identity survives. Shared protected actuals partition once; minimal Season and exports agree. | Actual allocation/effective-finance suites and synthetic mapping rehearsal below; Home exact-money and approved-zero coverage. |
| V-09 — rendered UI/CI | Project, department readiness/send, Finance grouped review, purchases/invoices/funding, Season and Home inspected locally. Desktop and supported CSS 768 layouts are readable, with local table scrolling, native focus/dismissal and shared notification recovery. Home shows 10,500.75 split 9,750.75/750 and excludes unfinished Drafts. | Screenshots outside Git in the existing visualization directory. All local commands and three independent review axes pass; PR CI remains the final publication gate. |

Counts from focused runs overlap and must not be added. The baseline full root run at `1c45774` passes 240 files and 2,341 tests, with one optional `ATTIO_IMPORT_SNAPSHOT` skip; all Finance and partner PostgreSQL cases execute. Log: `/private/tmp/helix-pba-final-integrated-tests.log`. At that checkpoint, product compatibility change `36b41f8` replaces Object.hasOwn with equivalent Object.prototype.hasOwnProperty.call for the deployment compiler's library target. Scoped purchase read and both API typechecks pass; independent reviewers cleared the exact final commit.

## Baseline independent review

All reviewers inspected source and meaningful tests; they did not rerun runtime commands. Root owns the execution evidence.

- Complete correctness/regression/failure-path/security: `/root/correctness_review`, clear at 36b41f8 against b05c5a4. All reported defects repaired and independently cleared.
- Standards axis: `/root/standards_review`, zero actionable findings at the same base/head.
- Spec axis: `/root/spec_review`, zero actionable findings at the same base/head, including revision 2/D16 and final Draft privacy.

These baseline reports remain valid for unchanged code. D17 review bindings are recorded below.

## Migration rehearsal

`test/api/_lib/project-budget-migration-rehearsal.postgres.test.ts` creates its own uniquely named database through the loopback postgres maintenance database, seeds historical registered/voided purchases, private evidence, an imported paid invoice with null requester and an approved request/commitment, then loads actual additive feature migrations. It never targets configured application data.

The dry run compares complete JSON rows of every Finance table before and after both valid and conflicting manifest previews. Application uses the actual lead authoring endpoint, department preview/send and Head of Finance package decision. The resulting effective plan contains exactly three stable anchors and17,000 total, with one replaced project plan and one unmatched legacy plan. Every pre-migration historical row retains its original fields; additive columns and new audit events are permitted. Source budget amounts are not overwritten by project promotion.

This is a synthetic rehearsal. Before live adoption an operator must supply and approve the real same-season entry-to-project/department manifest and ordinary priorities for adopted legacy EM entries. Unmatched records must remain explicit.

## Baseline command gates

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


## Live UI review addendum

Direct user feedback moved the department widget below Go to and simplified the project Budget view. The original Apps Script Finance.html at current source681a153 informed its table-first hierarchy, on-demand forms and hidden removed rows. Roote880b99 andcd7725b preserve the approved workflow while keeping secondary detail behind shared Radix disclosures. Hidden contents stay mounted, active forms lock closing and existing current-authority clearing remains. No API or database behavior changed.

Current correctness, Standards and Spec reviews all clear productcd7725b. The affected suite passes72 tests/9 files, client types and lint pass; the current frontend build is run in the isolated compiler. Browser checks cover editor/import/invoices, Enter/Space, Escape/focus restoration, vertical sidebar order and readable CSS768 with no document overflow. Screenshots are outside Git and recorded in delivery.md. The earlier full PostgreSQL and whole-feature evidence still applies to unchanged backend source. Final PR-head CI and readiness must be read from GitHub and the HELIX-84 follow-up evidence, rather than the earlier ce4f9e1 result.


## D17 member allocation access

Direct user instruction adds a current-project-member approved-only budget read to the existing PBA-02/PBA-09 feature. The baseline approval remains revision2 and the original approval hashes remain intact. The previous local member inspection that denied budget visibility is historical and superseded.

At final productcf17e124491497c4c7d91b271c546e5ec43ccb7d, the production reader authorizes verified current Google identity, active project access, same-project/season task assignment and associated department member/lead membership alongside the approved snapshot. It does not widen private Finance scope. The separate DTO allows public current approved entries, exact planned/actual totals, priority and fulfillment. Pending candidates, removed historical entries, notes/owners, invoice/document identifiers and links, funding context and review history are omitted. A nonthrowing route probe selects the reader, while the selected reader independently enforces its current scope.

| Check | Evidence |
| --- | --- |
| Approved-only access and privacy | Real074 approval, private Draft and submitted revision cases preserve the last approved allocation until whole-package approval. Approved revision metadata does not change with private draft edits. |
| Mutation/evidence denial | No request changes, authoring, reviewer, purchase/completion, upload, invoice or funding permission. Known successful author mutation nonces cannot be replayed by an ordinary member. |
| Current membership and role loss | Assignment, associated department, viewer-only, project access, current season and identity linkage denial controls. Real PostgreSQL reads observe complete old/new approved pointers and next-read revocation. |
| Transaction-safe dispatch | Raw explicit BEGIN denial returns403 and the next SELECT succeeds. Independent PostgreSQL private-reader revocation after a successful routing probe returns403 without member fallback. |
| UI downgrade and local parity | Approved-only member UI omits privileged controls/private child components. Privileged dirty purchase/editor state is cleared on downgrade. The reversible member persona remains DEV/member-local/loopback-only and preserves original fixture assignments. |
| Integrated regression |39 tests across five focused files pass at54fa2ea, with all three TypeScript checks and repository lint. Correctness clears54fa2ea, Standards and Spec clear unchanged productcf17e12. |
| Browser | Team Member sees approved9,750.75 and spent8,500 with three approved entries. Private draft100,749.25 and its description/note remain absent. No Request changes, edit, funding, invoice, version or history controls. Screenshot `project-member-approved-budget.jpg` remains outside Git. |

Final root suite at54fa2ea passes245 files and2,372 tests, with one optional ATTIO_IMPORT_SNAPSHOT skip; all Finance and partner PostgreSQL cases ran. Deployment guards pass3/3. Log `/private/tmp/helix-member-approved-final-full-serial-check.log`. All three types/lint and the isolated local generated build pass, with9.20MB static output and11 source/generated functions. Build log `/private/tmp/helix-member-approved-final-vercel-build.log`. Earlier concurrent-run startup timeout is superseded by the passing full recheck and separate12/12 local-API check. No assertions or timeouts were changed. Publication documentation does not change reviewed productcf17e12. Exact final PR-head checks and merge readiness remain authoritative in GitHub and HELIX-84. The parent stays open and PR #144 remains unmerged. No production migration, Drive write or deployment occurred.
