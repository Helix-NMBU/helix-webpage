# Finance ticket plan

Specification: [spec.md](spec.md), revision 1, approved and published on 26 October 2026.
Tracker: Linear. The files under issues/ are copies of the published issue bodies. Linear is the implementation tracker.
Parent: [HELIX-34](https://linear.app/helixnmbu/issue/HELIX-34/finance-member-budgets-purchases-approvals-and-financing), the specification rather than a worker assignment. Eleven children are published. The existing milestone ID was preserved and its name changed from Financial Budgets to Finance.

## Slices and direct blockers

| Draft ticket | Behavior | Blocked by | Requirements |
| --- | --- | --- | --- |
| [FIN-01 / HELIX-35](https://linear.app/helixnmbu/issue/HELIX-35/fin-01-establish-finance-access-data-contracts-and-protected-routes) | Establish Finance access, data contracts and protected routes | None | F-01, F-02, F-03, F-18 |
| [FIN-02 / HELIX-36](https://linear.app/helixnmbu/issue/HELIX-36/fin-02-create-approve-and-maintain-season-budgets) | Create, approve and maintain season budgets | FIN-01 | F-04, F-05 |
| [FIN-03 / HELIX-37](https://linear.app/helixnmbu/issue/HELIX-37/fin-03-manage-financing-and-earmarked-funding) | Manage financing and earmarked funding | FIN-01 | F-07 |
| [FIN-04 / HELIX-38](https://linear.app/helixnmbu/issue/HELIX-38/fin-04-preview-and-atomically-re-import-department-budgets) | Preview and atomically re-import department budgets | FIN-02 | F-06 |
| [FIN-05 / HELIX-39](https://linear.app/helixnmbu/issue/HELIX-39/fin-05-submit-requests-and-record-head-of-finance-decisions) | Submit requests and record Head of Finance decisions | FIN-02 | F-08, F-09 |
| [FIN-06 / HELIX-40](https://linear.app/helixnmbu/issue/HELIX-40/fin-06-register-actual-purchases-with-private-supporting-files) | Register actual purchases with private supporting files | FIN-02 | F-10, F-11 |
| [FIN-07 / HELIX-41](https://linear.app/helixnmbu/issue/HELIX-41/fin-07-fulfill-requests-through-several-actual-purchases) | Fulfill requests through several actual purchases | FIN-05, FIN-06 | F-09, F-13 |
| [FIN-08 / HELIX-42](https://linear.app/helixnmbu/issue/HELIX-42/fin-08-process-unpaid-work-voids-and-approval-exception-reviews) | Process unpaid work, voids and approval-exception reviews | FIN-07 | F-12, F-13 |
| [FIN-09 / HELIX-43](https://linear.app/helixnmbu/issue/HELIX-43/fin-09-show-commitment-aware-scenarios-and-finance-overview) | Show commitment-aware scenarios and Finance overview | FIN-03, FIN-07 | F-14, F-15 |
| [FIN-10 / HELIX-44](https://linear.app/helixnmbu/issue/HELIX-44/fin-10-deliver-durable-notifications-exports-and-recovery) | Deliver durable notifications, exports and recovery | FIN-05, FIN-06 | F-16, F-17 |
| [FIN-11 / HELIX-45](https://linear.app/helixnmbu/issue/HELIX-45/fin-11-verify-the-integrated-finance-milestone-and-prepare-review) | Verify the integrated Finance milestone and prepare review | FIN-04, FIN-08, FIN-09, FIN-10 | F-01 through F-18 |

## Dependency graph

```text
FIN-01: no blockers
FIN-02: FIN-01
FIN-03: FIN-01
FIN-04: FIN-02
FIN-05: FIN-02
FIN-06: FIN-02
FIN-07: FIN-05, FIN-06
FIN-08: FIN-07
FIN-09: FIN-03, FIN-07
FIN-10: FIN-05, FIN-06
FIN-11: FIN-04, FIN-08, FIN-09, FIN-10
```

Only FIN-01 is initially eligible. After that, FIN-02 and FIN-03 can proceed independently. FIN-04, FIN-05 and FIN-06 use the completed budget contracts. FIN-07 and FIN-10 follow request/registration completion; the final queue and scenarios then converge on FIN-11. These are scheduling options, not instructions to start agents during preparation.

Every edge is a real prerequisite. FIN-02 needs identity/schema/money contracts; FIN-03 needs explicit funding access/schema. FIN-04 needs working item mutations. FIN-05 and FIN-06 need eligible budget items. FIN-07 joins real approvals and actuals. FIN-08 needs the correct void/commitment hooks. FIN-09 needs actual/commitment and funding inputs. FIN-10 needs transactional event production. FIN-11 depends on all remaining terminal slices. Transitive prerequisites are not repeated as native blocker edges.

## Shared changes beyond the graph

| Shared area | Scheduling rule |
| --- | --- |
| Contracts, finance dispatch, api/finance.ts | FIN-01 establishes them. Coordinator reviews/registers later operation modules; avoid concurrent edits to one handler. |
| Migration filenames and private finance schema | FIN-01 fixes relational contracts. Coordinator allocates additive filenames from current main. FIN-02/03 coordinate cross-table constraints without a false functional dependency. |
| MemberPlatform routes, shell/sidebar and local-api/vercel wiring | Coordinator ownership at FIN-01 and FIN-11. Keep public Finance distinct from main's team.finance gate. Preserve other team's routes/features. |
| Budgets page and CSV | FIN-02 owns base page/item editor; FIN-04 adds import modules after it lands. FIN-09 touches summary/freshness integration, not CSV semantics. |
| Purchases page container | FIN-05 owns request subviews and FIN-06 registration subviews. Use separate files; coordinator connects tabs/actions. FIN-07 owns links and FIN-08 owns finance processing. |
| Actual/commitment calculators and invoice state | FIN-07 fixes fulfillment hooks; FIN-08 consumes void/payment hooks and FIN-09 calculations. FIN-10 exports canonical stored fields, avoiding a second implementation. |
| Notifications, outbox and uploads | FIN-01 publishes interfaces; FIN-05/06 produce intent and FIN-10 dispatches/reconciles. No email side effect runs inside the financial transaction. |
| Documentation and independent review evidence | Each slice records evidence in its ticket. FIN-11 writes integrated verification and reviews the full feature. |

## Publication and labels

The user approved revision 1 and this breakdown by selecting "Approve and publish in Linear" on 26 October 2026. One parent and eleven children are published. The parent has Feature/Backlog, no assignment and no ready-for-agent label. The eleven children have ready-for-agent, the shared parent/project/milestone and native blockedBy relationships matching the graph above. HELIX-35 starts Todo; HELIX-36 through HELIX-45 start Backlog. No assignees, delegates, dates or estimates were invented.

The attributed [source inventory](https://linear.app/helixnmbu/document/finance-source-inventory-26-october-2026-8b5eab2b1c49) is attached to the project and linked from the parent and every child. Full issue readback verified membership, labels, states and all blocker edges. The source inventory content matches after Linear's Markdown formatting normalization. Published identifiers and completion checks are recorded in [publication.json](publication.json).

## Execution and validation

Base is refreshed main, verified remotely during preparation. Proposed integration branch is codex/finance; worker names follow codex/finance-fin-XX. Create no branches or worktrees in Prepare. At delivery, use a suitable managed worktree to preserve this dirty project-management checkout. Copy only the approved Finance docs and reconcile agreed glossary terms with current main.

Use existing injected-service, PGlite, component and local HTTP seams, plus independent Postgres/storage checks for concurrency and finalization. Every slice includes the backend and affected UI. FIN-11 runs all three typechecks, lint, full tests, build/static/function guards, diff check, local desktop/mobile/keyboard checks and independent Standards/Spec review. Real identity, grants, private storage/CORS, email, references and recovery evidence remain explicit gates; no source or fixture test substitutes for them.

Prepare stops after approved publication. No implementation, remote source changes, database writes, live emails, push, PR merge or deployment starts here.
