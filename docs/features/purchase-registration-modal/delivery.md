# Validation and delivery

The implementation uses current main's approved project-budget versions and invoice storage dispatcher. Purchases can remain unallocated, link to a led project later, or allocate one payment across multiple approved entries. The original purchase and evidence remain intact. Invoice tasks require both the sent date and canonical funding receipt before completion.

The complete regression run passed 2,467 tests, with 88 environment-dependent tests skipped. All three deployment guard tests passed. After independent review, 37 focused tests passed for the reporting fixes, approved-system revisions, local financial projections, and existing project purchase flows. Frontend and API type checks, runtime unused checks, ESLint, and the production build passed. The build has 11 serverless functions and remains below the 10 MB static-output limit.

Browser inspection on loopback confirmed the cube in the selected project, opening and selecting the project menu, and checking multiple budget entries with separate amounts. The final selection showed two entries sharing NOK 1000.00 with NOK 0.00 left to allocate. The browser check used synthetic component data. It did not create production purchases or establish a signed-in production acceptance result.

## Standards

Independent review of `614ab9a...4f865f8` found no hard AGENTS.md violations. The reviewer identified one duplication heuristic, a repeated invoice read, and two correctness issues: unassigned local costs could break financial reads, and approved revisions could record an obsolete physical system. The repeated read was removed. The financial read now handles unassigned costs and line-level project ownership. Registration and later linking use the effective approved system. Regression tests cover these cases.

## Spec

Independent review found two requirement gaps: later project links were missing from exports, and local project financials omitted Management costs awaiting budget allocation. Export joins now use each line's project with the parent as fallback. Local financial reads preserve those costs before allocation and after linking. No additional requirement gaps or scope additions were reported.

The reviewed feature commit was `4f865f88a1276ab1e78095dc69d995be8f0637e0`. Review fixes are recorded in the subsequent commit.

## Release prerequisites

Production migrations `078_partner_invoice_progress.sql` and `079_management_purchase_registration.sql` were applied atomically on 23 November 2026 after explicit user approval. Before application, a production transaction rehearsed both migrations and rolled back successfully. Neon had no free branch slots for another validation branch.

The migration ledger matches both repository checksums. Verification preserved all 11 member records, eight purchases, eight purchase lines, eight allocations, and all document records. Registered actuals remain NOK 40,350.31, total funding remains NOK 224,237.33, and received funding remains NOK 134,237.33. The invoice-progress and purchase-registration functions, nullable unassigned system, and Finance label were read back successfully. No test purchase or payment was created in production.

Both independent reviewers verified that their findings were resolved in `64d7b4650eae2a280de4881618526686a1ed92ca`, with no remaining concrete issue in those fixes.
