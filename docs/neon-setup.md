# Neon application setup

Helix uses Neon Postgres, Managed Better Auth, and private Neon Object Storage. New applications, partner access, and contact messages start in Neon. No legacy records or files are imported.

## Application surfaces

| Surface | Production host | Access |
| --- | --- | --- |
| Website and application forms | `helixnmbu.no` and `www.helixnmbu.no` | Public |
| Member platform, including recruitment | `internal.helixnmbu.no` | Verified Helix Google Workspace account; recruitment additionally requires an administrator or recruiter grant |
| Partner portal | `partner.helixnmbu.no` | Email OTP, verified email, active approved organization membership |

Legacy public `/recruitment` and `/recruitment/login` links redirect to the member portal at `/recruiting`. Public `/apply` and `/apply/form` stay on the website. Legacy sponsor portal links lead to the partner portal.

## Local development

Copy `.env.example` to the untracked `.env.local` file and fill in the Neon database, auth, Google client, and storage values. Browser variables use `VITE_`; database URLs, Google validation settings, storage keys, and email credentials remain server-only. Restart Vite after changing environment values.

Run `npm run dev -- --host 127.0.0.1 --port 5190 --strictPort`. Vite serves the existing `/api/*` handlers locally, with real authentication and authorization. Requests must come from loopback and the same origin. Do not expose this development server to a network.

- `VITE_MEMBER_PLATFORM=true`: member app at `/login`, `/profile`, `/mail`, and `/recruiting`.
- `VITE_MEMBER_PLATFORM=false`: website; partner OTP at `/sponsorportal-login`.
- `npm run dev:member`: the existing dedicated loopback-only UI development mode. It uses a local account and empty recruitment collection, and disables real API access. It does not prove cloud login, database, or mail delivery.

Hosted staging is no longer required. For real local integration testing, select the intended Neon database in `.env.local` and use real authorized accounts. The database URL determines which data is changed.

## Schema and storage

The Helix Neon project is `cool-lake-32274277`; current main branch is `br-super-resonance-ba0eq1wt`. Managed Better Auth must already be provisioned and own `neon_auth."user"` and `neon_auth.account`.

Use a direct/unpooled owner connection for migrations:

```sh
npm run neon:setup
npm run neon:setup -- --apply
```

The first command only reports pending migrations. The second runs them with an advisory lock and checksum ledger. Existing migrations 001–003 are idempotent; an older database without a ledger can adopt them without importing users or replacing existing member records. Do not edit a recorded migration; add a new one.

Schemas: `identity` for verified members, `cv` for CV drafts and publications, `identity.gmail_connections` for encrypted Gmail connection metadata, `partner` for approved partner organizations and memberships, and `website` for new applications and contact messages. Browser database roles have no direct access to the new private schemas; authenticated server APIs enforce authorization.

## Workspace schema recovery

The member directory, project directory, department pages, tasks, and Season Overview require the `project_management` schema. Deploying application code does not apply SQL migrations. A database that only has the earlier member and recruitment schemas cannot load these workspaces.

Before releasing workspace changes, use the intended branch's direct connection in the untracked `.env.local`, run `npm run neon:setup`, and review all pending filenames. Apply them with `npm run neon:setup -- --apply` after production authorization. Preserve the migration ledger and existing member records. Run the dry check again afterward, then verify Members, Projects, Departments, and an assigned department with a real authorized account. A schema migration does not grant project access or department membership.

`test/workspace-migration-upgrade.test.ts` applies the full ordered migration chain to an isolated database containing an existing member and verifies that the workspace loads with that member preserved. It does not access Neon.

Production verification on 28 October 2026: the 15 workspace migrations from `009_project_management.sql` through `023_project_requires_lead.sql` were tested on the temporary Neon branch `workspace-migration-validation-20261028` (`br-still-poetry-baylswss`), then applied atomically to main (`br-super-resonance-ba0eq1wt`). All 15 repository checksums match `helix_migrations.applied`. Both existing members and both CV documents remain present. Members, Projects, and Departments were verified in the signed-in production browser; the directory shows seven departments and no projects. Tasks returns the expected project-access denial because no project grants exist. No department memberships were added, and no frontend deployment was performed. The validation branch is retained for inspection.

Platform access is managed from **Workspace → Members → edit → Access**. The former `/admin/access` route redirects to `/members`. The Access tab has separate Department access and Space access sections. Space access controls Season Overview, Recruiting, and Financials independently. Saving uses the administrator-authorized member-access API and updates memberships and space permissions in one transaction with revision checks. Existing management and administrator roles are preserved. Recruiting can be explicitly revoked even when a role would otherwise grant it. Another administrator must change your own access. Details contains the name and Assigned Helix Position. Migration `025_workspace_space_access.sql` must be applied before releasing these controls. Financials also requires the existing finance migrations, including `024_financials_member_role.sql`.

Keep both storage buckets private:

- `NEON_STORAGE_BUCKET=member-cvs` for published member CV PDFs.
- `NEON_APPLICATIONS_BUCKET=applications` for applicant files.

`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `NEON_S3_ENDPOINT`, and `NEON_S3_REGION` must belong to the same Neon branch as the selected database. Applicant CVs are limited to 500 KiB. The server generates paths and returns short-lived signed downloads only after authorization.

Public application submissions are limited to 10 valid submissions per source IP in a one-hour window. The server stores only an HMAC of the IP, keyed with the server-only database URL; stale limiter rows are removed after two days when submissions arrive. Migration 007 creates the private limiter table.

## Google member login

Keep the existing Google OAuth provider. `GOOGLE_CLIENT_ID` must match that provider's client ID. In Google Cloud, register the exact Neon callback `{NEON_AUTH_BASE_URL}/callback/google` on that client. A client ID ending in `.apps.googleusercontent.com` is an identifier, not a redirect URI.

Neon trusted origins must include the public, internal, and partner HTTPS origins. Enable Neon Allow Localhost for local integration testing. Member login requests Google's account chooser. OTP sign-in does not create a recruiter or partner permission.

## Partner OTP

In Neon Console → main branch → Settings → Better Auth, enable **Sign-up with Email** and **Sign-in with Email**. The installed Neon SDK exposes `emailOtp.sendVerificationOtp` and `signIn.emailOtp` through Managed Better Auth. Password fields are not part of the partner interface.

Configure a dedicated production email provider in the same settings. Neon's shared email server is for development; do not treat a successful UI test as production delivery verification. See [Neon email OTP documentation](https://neon.com/docs/auth/guides/plugins/email-otp).

An administrator must create a real organization and explicitly approve each contact email using the database owner. The UI cannot self-grant membership. No organizations, contacts, or recruiters are seeded by migrations.

Example using `psql` variables supplied by the operator:

```sql
-- Set organization_name and partner_email to the approved organization/contact.
insert into partner.organizations (name, active)
values (:'organization_name', true)
returning id as organization_id \gset

insert into partner.memberships (organization_id, invited_email, status, approved_at)
values (:'organization_id'::uuid, lower(btrim(:'partner_email')), 'active', now());
```

A membership can optionally bind `auth_user_id` after verifying the contact's Neon identity. Both the organization and membership must remain active, unrevoked, and unexpired. To revoke access, update that membership to `status = 'revoked', revoked_at = now()`. Authorization is repeated on session reads, directory listing, and downloads.

OTP requests use a generic response so they do not reveal which emails are invited. Requesting a code does not grant access. The directory reads current published CVs and respects each member's sharing settings; private drafts are never shown.

## Recruitment roles

Recruiting is `/recruiting` inside the member shell. Its sidebar entry appears only after the server confirms access. Existing server-designated administrators can manage recruiting. Other members need an explicit active recruiter grant:

```sql
-- Set recruiter_email to the approved verified Helix member's email.
insert into website.recruiters (email, active)
values (lower(btrim(:'recruiter_email')), true)
on conflict (email) do update set active = true;
```

Remove an ordinary recruiter's access with `update website.recruiters set active = false where email = lower(btrim(:'recruiter_email'));`. Every application list, detail, file, rejection, deletion, and confirmation request checks the verified Google identity and current permission. The sidebar rechecks on focus; unauthorized direct routes return to Home. Signing out clears private application state. Granting recruiter access does not make a user an administrator.

## Transactional email and cleanup

Website email requires `WEBSITE_EMAIL_ENABLED=true` and `RESEND_API_KEY`. Use `HELIX_ENVIRONMENT=production` only in production. Locally, set `HELIX_ENVIRONMENT=local` and explicitly allow test recipients in `WEBSITE_EMAIL_TEST_RECIPIENTS`; otherwise delivery stays disabled. This website-mail switch is separate from the Neon OTP provider.

Contact messages are saved before optional notification delivery. Application submissions are saved even if confirmation delivery fails. Uncertain email outcomes remain recorded for review, avoiding blind retries and duplicate sends. A rejection with disabled delivery explicitly reports that no email was sent.

`website.application_uploads` tracks uploads with uncertain outcomes. `website.file_cleanup` tracks files whose deletion needs retry. Before manual cleanup, confirm that no application references a path and that it matches that application's server-generated directory. Never delete files after an uncertain submission commit without checking whether the application was saved.

## Release checks

Run `npm run typecheck`, `npm run typecheck:api:runtime`, `npm run typecheck:api`, the relevant Vitest tests, and `npm run build`. Verify the affected UI locally. Before production release, verify real Google sign-in, an approved partner's OTP delivery, ordinary-member recruitment denial, approved-recruiter access, revocation, and private file downloads against the chosen Neon services.

Attach `partner.helixnmbu.no` to the production Vercel project and configure its DNS before publishing the partner portal. Set the production bucket/email variables and confirm dedicated Neon SMTP. Code changes remain local until publishing is authorized.

## Member access production release, 28 October 2026

Applied the 12 existing Financials migrations (`011_finance_core.sql` through `021_finance_final_candidate_ledger.sql`, plus `024_financials_member_role.sql`) and `025_workspace_space_access.sql` atomically to Neon main after validation on `br-still-poetry-baylswss` and explicit production approval. All 13 ledger checksums match the repository. The migrations added no member space grants. Both existing member and CV records remain present.

Published immutable Vercel deployment `dpl_Gf6RoT3Fd61KFkBs4WwDmoxUJuHW` from the tested working tree on `codex/workspace-loading-member-access`, based on main `87b1749`. The source snapshot preserves the production finance implementation. Later concurrent department-permission edits in the local checkout are outside this deployment. Validation passed 1,558 tests, three deployment guards, lint, TypeScript checks, and the production build. Six environment-dependent tests were skipped. Static output is 9.56 MB and the function count is 11.

Production browser verification confirmed that Member access is absent from the sidebar, `/admin/access` redirects to `/members`, and pencil edit controls open Department access and Space access inside Members. Space access lists Season Overview, Recruiting, and Financials. Permission writes were exercised locally and on the isolated validation branch; no real member permissions were changed to test the published UI.

### Department access levels

Migration `026_department_access_levels.sql` adds Member, Viewer, and Lead access. Existing members stay Members and existing department Leads stay Leads. Project Managers and Platform Administrators are assigned Viewer access to all departments, with full management permissions supplied by their platform role. Removing either role leaves Viewer access in place unless the member has the other management role.

Department Leads can edit settings and create, edit, assign, and delete projects, milestones, and tasks in their department. Members can view department work and update the status and blocked reason of tasks assigned to them. Viewers can only read department work. Legacy work-area grants do not grant department management access. Department access works independently of Season Overview access.

Deleting a project removes its milestones and tasks. Deleting a milestone removes its tasks. Both actions require confirmation and preserve recorded task status history. The migration must be applied before the matching application code is released.


Department access release validation, 28 October 2026: migration `026_department_access_levels.sql` was tested on `department-access-validation-20261028` (`br-misty-rain-baz8khoh`), then applied atomically to Neon main (`br-super-resonance-ba0eq1wt`) for the authorized main merge. Its recorded SHA-256 is `d5be9dbfb77197977ec20cc14260c1842c4fadb16fe85a118dfc30f9829bafe4`. Both member profiles remain present, and the database still contains zero projects and tasks. The two members with management roles each have seven Viewer memberships. Lead flags match the new access levels. The validation branch is retained for inspection.

Validation passed 1,571 tests and three deployment guards, with six environment-dependent tests skipped. Lint, frontend and API TypeScript checks, and the production build passed. Static output is 9.56 MB with 11 functions. The member access selector and Members column filtering were inspected locally.
