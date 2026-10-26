# Sponsor portal verification

Verified 25 October 2026. Code commit: `13449337c88a867994f801f7d349d44789319e21`. Base: Member CV PR #62 at `60edbc1216df7f16fefe333d7fcdbd3aa1933f4f`.

## Automated checks

All 665 Vitest tests in 49 files and two Node deployment checks pass. Frontend, API and API-runtime TypeScript checks, repository lint, build and diff checks pass. Static output is 9.08 MB under the 10 MB limit. Existing large-bundle and dependency annotation advisories remain. Repository ESLint covers JavaScript, not TypeScript; TypeScript receives compiler checks and independent review.

The final suite uses four concurrent workers. Running all embedded SQL/WASM suites concurrently caused cold-start timeouts in two tests; bounded concurrency completed all assertions in 15.43 seconds. No test was removed or skipped. The initial restricted run could not bind the existing JWT test server; final verification ran with loopback permission.

Actual SQL tests apply migrations 003/004 to PGlite and cover identity binding, verified/unbanned accounts, invitations, role/tier/date boundaries, revocation, organization isolation, administrator edits, publication/privacy, CV disposition/expiry, request ownership, transitions, stale writes and atomic history rollback. Installed-SDK tests cover session proxy behavior and account changes. Composed-workspace tests cover permission failures without discarding unsent replies and the theme scope used by body portals.

## Browser evidence

The local server is `npm run dev:sponsor` at http://127.0.0.1:5192/sponsor. It calls the real API composition, authorization and SQL against an in-memory PGlite database. Accounts and CVs are fictional. It does not connect to Neon, send email or use production credentials. Production builds and ordinary development mode cannot activate this fixture runtime.

| Scenario | Observed result |
| --- | --- |
| Sponsor directory | Two explicitly published profiles appear; private and withdrawn profiles stay absent. Name search returns one matching profile. Programme/year/department/skill controls render. |
| Published profile and consent | Alex's shared email appears; hidden phone is absent. Sam's hidden contacts and CV actions are absent. |
| CV viewing/download | View opens an authorized inline PDF; Download produces actual PDF bytes. Poppler extraction/rendering confirms the fictional published content, Nordic characters and absent hidden phone without clipping. |
| Sponsor request | Submission persists as Submitted with author, organization and shared history. |
| Administrator follow-up | The submitted request appears in the admin queue. Assign to me enables reply/status controls. A shared reply and Input needed transition both persist in history. |
| Sponsor response | Sponsor sees the shared admin reply; responding to Input needed returns the request to Under review atomically. |
| Administrator records | Created an organization and named contact, edited/deactivated the contact, saved a Silver agreement, reloaded and confirmed its dates, then revoked it. |
| Restricted roles | Bronze sees collaboration requests without Talent Directory. Expired agreement is denied. Developer sign-in grants neither sponsor data nor administrator controls. |
| Logout | Sign out ends the local session and opens the invitation-only email login page. |
| Mobile | At 390 x 844, directory/profile and request reply work. Document scroll width is 375; the profile dialog is 358 px wide with x=16 and right=374. No horizontal overflow was observed. |
| Theme | Dark profile dialog uses the scoped rgb(16,16,16) background. Automated scope regression covers saved light theme and login surfaces. Light mode was not separately visually inspected. |

Native date values inserted by browser controls were not always reflected in React state before submission. The agreement form now reads named FormData values and synchronizes them. A browser save followed by reload confirmed 2026-10-01 to 2027-10-01 correctly persisted.

Screenshots are kept outside Git at `/private/tmp/helix-sponsor-portal-20261025.jpg`, `/private/tmp/helix-sponsor-admin-request-20261025.jpg`, `/private/tmp/helix-sponsor-mobile-directory-20261025.jpg`, `/private/tmp/helix-sponsor-mobile-profile-20261025.jpg` and `/private/tmp/helix-sponsor-mobile-request-20261025.jpg`. Downloaded fictional PDF: `/Users/henrik.noteless/Downloads/helix-cv.pdf`. Render: `/private/tmp/helix-sponsor-cv-20261025.png`.

## Independent review

Full correctness/security review: `/root/correctness_review`. Spec: `/root/spec_review`. Standards: `/root/standards_review`. All reviewed the complete change against the fixed base and re-reviewed repairs through code commit 1344933. No unresolved P1/P2 or material standards/spec findings remain. Reviewers did not implement this feature or submit a human GitHub approval.

The original review found an operation-specific 403 could discard an unsent administrator reply and a missing theme scope. Both were repaired and received composed regressions. The native-date and test-concurrency changes were also independently reviewed.

## Remaining live gates

HELIX-12 still needs configured managed Magic Link delivery/callback verification with an authorized recipient. Enable only the Magic Link-specific registration restriction, preserve Google member onboarding, provision approved provider identities and configure production SMTP. No invitation email was sent by this implementation.

HELIX-20 has a non-mutating configuration preflight and migration/recovery instructions; no new live configuration or sponsor migration was applied. No sponsor hostname is selected. HELIX-21 requires configured live sponsor/member/admin acceptance, real storage evidence, the outstanding HELIX-8/9 account/session checks and HELIX-10's accepted member delivery. HELIX-22 needs named pilot participants, support/sign-off owners and an actual readiness decision. Commercial package approval remains a rollout prerequisite.

The code is committed locally on detached HEAD in `/private/tmp/helix-sponsor-mvp-20261025`. No named branch was created, no push or sponsor PR was made, and nothing was merged or deployed. The existing member PR and user checkout were preserved.
