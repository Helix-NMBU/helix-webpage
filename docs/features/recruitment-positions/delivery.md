# Recruitment milestone completion

Updated: 2026-10-26
Repository: Helix-NMBU/helix-webpage
Branch: codex/recruitment-milestone-completion
Base: ccbc68c64c379c5cede610f90114a36f94dc749b
Tracker: [Recruiting / HELIX-29](https://linear.app/helixnmbu/issue/HELIX-29/move-recruiting-into-the-member-portal-with-role-based-access)

## Approved work

The user's 26 October implementation request adds acceptance criteria to the Recruiting milestone, which Linear already marks complete. Implement position management linked to the public website, verify application submission and authorized review, and preload recruitment data and sidebar access for the authenticated session. The older draft scope in this folder describes historical scoping; its staging workflow and lack of implementation authorization are superseded by the user's current request and AGENTS.md. This work preserves the existing recruiter allowlist and server-verified administrator model. It does not implement the proposed organizational access-role redesign.

## Implementation

- Migration 008 introduces the Neon positions catalog. It seeds the current public postings once without copying legacy application records. Replaying the migration does not restore deleted postings.
- The existing website API serves visible positions publicly, supplies all positions to recruiters, and supports authorized create, edit, visibility, and delete operations. Submission validates against the same visible catalog. Saved applications retain their original position ID/title after catalog changes.
- Recruiting has Applications and Positions tabs. The editor covers every posting field, starts new postings hidden, retains failed drafts, and uses shared notifications.
- Login resolves the recruitment grant and preloads all application pages and positions before showing the workspace. A provider above the routed pages keeps those lists and the grant in memory throughout the session. Ordinary navigation and browser focus do not repeat recruitment checks or fetches. Refresh explicitly gets external changes.
- Every protected API operation still authenticates and checks authorization. Denied operations clear cached private data and revoke the sidebar capability. Session/account changes unmount the provider. Signed download links are not cached.
- Data revisions prevent older refresh responses from overwriting successful mutations. Application deletion updates session memory even when the user leaves its page during the request.

## Assignments and review

- Backend implementation: position_backend, isolated /tmp/helix-recruitment-position-api, branch codex/recruitment-position-api, commit 6e13fc0. Integrated as a reviewed patch while retaining preexisting handler consolidation.
- Editor implementation: recruitment_flow_audit, isolated /tmp/helix-recruitment-position-editor, branch codex/recruitment-position-editor, commit 53ee382. Integrated as a patch and adjusted the default application URL to use the selected posting.
- Coordinator: public catalog consumers, session provider, portal integration, race fixes, and regression coverage.
- Independent review: recruitment_review. Initial findings about dynamic department filters, multiple Open postings, Home retry recovery, and stale refresh/deletion results were fixed. Follow-up review reported no material findings.

## Local verification

- PGlite integration tests exercise migrations, hidden/public CRUD, public submission, authorized review and private files, denial/revocation, and application retention after posting deletion.
- React tests cover public catalog consumers and stale position URLs, all visible Open postings, editor failure recovery, session preload/deduplication, navigation, manual refresh, revocation, mutation races, and old-account results.
- Browser: dedicated loopback member-local mode, http://127.0.0.1:5190/recruiting. Created a hidden Controls Engineer posting, navigated Home and back, verified retained fields, then changed visibility and saved. This browser check used development-only in-memory data; it does not prove live Neon identity or object storage acceptance.
- Environment: untracked .env.local with HELIX_ENVIRONMENT=local and email disabled. No real database or auth credentials were present.
- Frontend, API and API-runtime typechecks and ESLint passed. The repository's ESLint configuration does not lint TSX.
- Production build passed: 9.14 MB static output of the 10 MB budget; 9 source functions of the 11-function target. Old generated .vercel/output, which described the retired entrypoints, was preserved at /tmp/helix-recruitment-vercel-output-before-20261026 before checking the current build. A fresh generated Vercel deployment has not been built or published.
- Final full suite passed: 74 Vitest files and 940 tests, plus 2 deployment guard tests. The loopback API/auth tests require local socket permission in a sandbox.
- Final independent delta review reported no new blockers; git diff --check passed.

## Preserved preexisting work

Before this task the checkout had edits to AGENTS.md, website-handler.ts, the Vercel function checker and vercel.json, deleted standalone confirmation/rejection routes, and untracked CONTEXT.md plus feature scope/navigation documents. Those changes were preserved. Local validation exposed an accompanying stale allowlist in scripts/local-api.mjs; removing the two retired direct handler mappings makes the existing website rewrites work. Existing session-cache behavior also required updating stale account-menu and CV repository assertions.

## Release requirements

No push, PR, external migration or deployment was performed. Apply migration 008 through the existing migration runner to the intended Neon database before releasing the code, after any prerequisites. Real-account Google/member authentication, recruiter access, application storage and private CV download still need acceptance against that configured environment. Linear's already-completed milestone was not changed to imply those production checks passed.
