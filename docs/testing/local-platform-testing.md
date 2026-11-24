# Local platform testing

Run `npm run dev:member -- --port 5197`, then open:

`http://127.0.0.1:5197/recruiting?memberRole=platform_tester&testData=full`

The selected synthetic account is Alex Example. The platform tester profile provides administrator, project and department management, recruitment, Finance including Head of Finance, Pipeline and Partner agreements access in the dedicated signed-in loopback session. It persists as a local profile selection across navigation and reloads. It does not create real accounts, sessions or database grants.

The setup adds data once and preserves existing edits:

- 14 additional members, giving a fresh workspace 16 members, with two additional people per department and embedded avatar images.
- Existing complete S27 finance scenario: 16 additional projects, 15 project budgets, 31 purchases, income, earmarks, P0 obligations, pending department and Finance reviews, draft changes, and incomplete and completed purchases.
- 35 additional tasks across backlog, todo, in-progress, blocked and done, including overdue and unassigned work. Department descriptions and project milestones come from the existing scenario.
- 12 additional deal/grant cards, one of each type in every stage, including Won/Approved. Sponsor tiers, confidence, contacts, follow-up dates, cash and an in-kind deal exercise the card and side-panel interfaces. Won deals generate their normal local deliverable and invoicing tasks.
- 18 recruitment applications across S27 and S26, eight positions including one hidden position, downloadable generated CVs and some profile images. Position edits, visibility and application removals persist locally. Rejections do not send email.
- 12 additional mail messages with unread/read, starred, sent, archived and trash examples. Local message actions and composed messages remain in browser storage; no email is transmitted.

An existing workspace can have more records. Previously edited cards, projects, tasks, budget records and recruitment records are retained. The suite marker prevents reruns from restoring records you intentionally delete while testing. Browser backups use `helix-platform-testing-backup-v1`; the underlying finance scenario keeps its own backup. No storage is reset automatically.

Use `?memberRole=project_member` for the restricted member view, or `?memberRole=default` to leave the full test profile. Existing `budgetRole`, `fundingRole` and `financeRole` query parameters still allow narrower workflow tests. Remove those parameters when using the full platform tester profile so an explicit previous selection does not override it.

Data is synthetic browser storage. Neon staging remains the database for real local integration and migration checks; this setup does not seed or alter Neon staging or production. The existing member CV sample is reused. External Drive, OAuth and delivery integrations and advanced server-only agreement/reconciliation actions still require separately authorized integration testing. The local shared-agreements view is populated without exposing unsupported agreement mutation controls.

Validation covers guarded initialization, additive and repeatable setup, existing-edit preservation, profile switching, budget linking/unlinking, recruitment persistence, local mail actions and refusal outside dedicated signed-in loopback mode. Browser checks cover Recruiting, Members, Spending and Pipeline.

Verified locally: 183 tests passed across 17 suites, plus the generated-CV parser test passed in the eight-test scenario suite, giving 184 passing tests across the relevant checks. Typecheck and production build passed. Static output is 9.77 MB/10 MB; serverless functions remain 11/11. No release, production grant change or Neon write was performed.
