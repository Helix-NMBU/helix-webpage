# Recruiting release

Updated: 2026-10-26
Repository: Helix-NMBU/helix-webpage
Feature branch: codex/recruitment-milestone-completion
Reviewed main base: 36dddd3bb62fd74b387dfb4673f7940a667dfb65
Reviewed implementation: 7182b1a1f531f162a574553e40e159cd8c74999d
Tracker: HELIX-31, HELIX-32 and HELIX-33 in the Recruiting milestone.

## Scope and authorization

The user approved publishing, merging to main and releasing the recruitment milestone, and explicitly requested retaining the feature branch. Work was isolated in /Users/henrik.noteless/.codex/worktrees/recruitment-release/helix-webpage to preserve the shared checkout's ongoing project-management work. GitHub automatic branch deletion is disabled.

Recruiters manage visible/hidden postings, including Open Application, and review public website applications. Position entries have immediate visibility switches and accessible icon-only Edit/Delete controls. New postings default to hidden, the editor covers all posting fields, and failed saves retain input with shared notification feedback.

## Integration and schema

Main had already acquired the managed positions catalog and role-based feature grants from migration 009. The release retains that schema, existing catalog rows and identity.member_has_feature authorization. The undeployed migration 008 is superseded and removed. No new production schema migration is required, and 009's seeding and legacy recruiter grants were not replayed. The existing production migration ledger does not contain a 009 entry; operators must validate/adopt that existing schema before using the general migration runner rather than blindly replaying its data/grant statements.

The new editor uses the existing Neon catalog. The dedicated visibility endpoint changes visibility without overwriting posting text. Legacy placeholder Typeform links open the platform application form. Public listing/form reads and submission validation use the same visible catalog; submitted applications keep the server-selected position ID/title after a posting is hidden or deleted.

All member feature access and recruitment lists are retained for the authenticated session. Login preloads all application pages and managed positions. Navigation and browser focus do not repeat those loads or separate sidebar capability checks. Explicit Refresh obtains external changes. Every protected API request still authenticates and checks feature authorization; denial clears private cached data, and account/session changes discard the old provider. Signed file URLs are requested on demand.

Session data revisions protect against older refreshes. Per-position operation versions also prevent a delayed save or visibility response from restoring an entry deleted after navigation.

The branch includes pending deployment stabilization: Node 24/npm 11.17 toolchain pinning, a current local Vercel CLI, and API tests moved outside deployment entrypoints. Latest main mail/signature work was merged without dropping it. No unrelated project-management implementation is included.

## Verification

- Clean npm ci passed in the isolated worktree.
- Full integrated suite passed: 79 Vitest files and 986 tests, plus 3 deployment guard tests. After the final mutation-race fix, all 7 session-cache tests passed. CI verifies the exact published revision separately.
- Frontend, API and runtime typechecks, ESLint and whitespace checks passed. TSX is outside the repository's current ESLint configuration.
- Vite production build passed at 9.20 MB of the 10 MB static budget.
- A real local Vercel production build completed successfully. Source and generated function checks both passed at 10 of the 11-function target.
- Standards review reported no actionable violations. Spec/correctness review found the delayed-save race; commit 7182b1a fixed it and the reviewer confirmed no remaining material findings.
- Real Google/member authentication was observed at internal.helixnmbu.no/recruiting using the existing platform-administrator account. No production test account was created.
- Temporary Neon branch br-round-waterfall-bas93pob verified actual catalog CRUD, visibility filtering, public-service application persistence, authorized list/read, title selection from the catalog, application retention after posting deletion, denied access without the role grant, and actual private PDF upload/download. The service harness bound its test identity to the existing member row; real browser authentication was verified separately. Synthetic data is restricted to this temporary branch and dedicated local UI mode. The branch expires on 2026-10-27 at 20:00 UTC.
- Runtime private storage acceptance used the temporary branch's private applications bucket and short-lived signed URLs. It does not establish the production runtime credential's bucket permissions.

## Public-domain backend connection

The public website still deploys from this repository under the older Vercel team, whose application API lacks database configuration. Public HTTPS hosts helixnmbu.no and www.helixnmbu.no now call the configured internal.helixnmbu.no recruitment API directly for public catalog reads and submissions. Local and preview hosts retain relative API requests. No DNS or domain ownership changes are needed.

The backend permits browser CORS only for those exact two HTTPS public origins, supports JSON submission preflight without credentials or Authorization headers, and rejects protected member actions from those origins. Protected internal requests retain real authorization. Direct browser requests preserve the normal Vercel client-IP rate-limit path rather than funneling applicants through a shared proxy address. Responses remain uncached. Production browser acceptance follows deployment of both GitHub-connected projects.

Final integrated verification after the public-backend connection: 81 Vitest files / 991 tests and 3 deployment guards passed; frontend/API/runtime typechecks, lint and build passed. Public connection delta independently reviewed with no actionable findings.

## Publication

PR, CI and production deployment details are recorded in Linear and appended after verification. Retain codex/recruitment-milestone-completion after merge.
