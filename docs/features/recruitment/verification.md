# Recruitment and Neon verification — 26 October 2026

Recruiting flows from the member sidebar to `/recruiting`, through bearer-authenticated website APIs, to private Neon application records and files. Public application forms remain on the website.

## Evidence

| Boundary | Result | Evidence |
| --- | --- | --- |
| Member UI | Passed locally | Browser inspected the application page inside the shared member sidebar, breadcrumb, theme and account menu. Home/sidebar navigation worked. The dedicated loopback UI mode used an empty application collection. |
| Sidebar and route authorization | Passed in tests | Ordinary members have no Recruitment entry and direct navigation returns Home. A server grant enables the entry for an administrator or approved member. Focus revalidation removes access after revocation. |
| Login return | Passed in tests | The Google callback and member login destination retain `/recruiting`; existing unsafe-return tests still pass. |
| API authorization and persistence | Passed in tests | PGlite-backed service tests cover ordinary-member denial, explicit grants, revocation, private file ownership, submission validation, uncertain uploads and email outcomes. Signed JWT tests cover invalid authentication. |
| Local fixture isolation | Passed in tests | Four additional tests require the dedicated development mode, loopback, and an active local UI session. Production-mode and signed-out requests use real server authorization. |
| Live Neon setup | Applied and read back | Migrations 004–006 recorded on main. Existing identity member count remains 2. Organizations, partner memberships, recruiter grants and new applications are empty. No legacy data imported. Private applications bucket exists. |
| Neon OTP setting | Enabled and read back | Main email sign-in is enabled, Google provider retained, and the exact partner HTTPS origin is trusted. |
| Real browser → cloud acceptance | Pending | No `.env.local` credentials or real partner membership were created. No real application was submitted and no OTP or rejection email was sent during this verification. |

## Checks

- Full Vitest run: 54 files, 647 tests passed with loopback access. The initial sandbox run hit `listen EPERM`; rerunning with loopback access resolved both affected suites.
- After adding fixture-isolation and login-return assertions: 3 focused files, 37 tests passed.
- Frontend, API and NodeNext runtime typechecks passed.
- ESLint, both deployment guard tests, and migration-script syntax check passed.
- Production build passed; static output remains below the 10 MB deployment limit.
- `git diff --check` passed.

## Release boundary

Code remains local and uncommitted. No application deployment was made. Linear HELIX-29 is In Review. Partner production launch still requires dedicated Neon email delivery, real approved partner membership testing, domain/DNS setup, production environment values, and an authorized release. Use `docs/neon-setup.md` for configuration and explicit recruiter/partner grants.
