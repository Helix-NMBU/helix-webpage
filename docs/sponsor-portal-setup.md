# Sponsor Portal v2 setup

The portal uses Supabase for authentication, authorization, database records, and private files. Resend sends invitations and workflow notifications. The production database starts empty except for lookup data created by the setup script.

## 1. Create the database

Create a new Supabase project and run [`supabase/sponsor-portal-v2.sql`](../supabase/sponsor-portal-v2.sql) in the SQL editor. The script creates the portal tables, private storage buckets, helper functions, row-level security policies, benefit catalogue, and department lookup values.

Do not add real sponsor contacts, agreement dates, prices, or credentials to the SQL file. Add them through `/admin/sponsors` after deployment.

## 2. Configure authentication

Enable email authentication and magic links in Supabase. Add these redirect URLs:

- `http://localhost:5173/portal`
- The production site URL followed by `/portal`

Enable Google authentication for Helix members. Keep the existing Google web client configured with the local and production origins. Member access still requires an active row in `public.members`; possession of a `@helixnmbu.no` address alone does not grant administrative access.

Bootstrap the first administrator in the Supabase SQL editor:

```sql
insert into public.members (email, full_name, status, has_sponsor_portal_access)
values ('administrator@helixnmbu.no', 'Administrator Name', 'active', true);
```

Replace the example values before running the statement. The first successful Google sign-in links the Auth user to the matching member row.

## 3. Configure browser variables

Set these in `.env` locally and in the Vercel project:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_GOOGLE_CLIENT_ID=
VITE_GOOGLE_ALLOWED_DOMAIN=helixnmbu.no
VITE_SUPABASE_CV_BUCKET=member-cvs
VITE_SUPABASE_PROFILE_BUCKET=member-profiles
```

All `VITE_` values are sent to the browser. Never put a service-role key or Resend key in them.

## 4. Configure server variables

Set these only in the server environment used by Vercel functions:

```text
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
PUBLIC_SITE_URL=https://helixnmbu.no
PORTAL_FROM_EMAIL=Helix Sponsor Portal <no-reply@helixnmbu.no>
SPONSORSHIPS_TO_EMAIL=sponsorships@helixnmbu.no
MEMBER_OPPORTUNITIES_EMAIL=
```

`MEMBER_OPPORTUNITIES_EMAIL` may be a moderated Google Workspace group that reaches active Helix members. Verify the sending domain in Resend before testing invitations.

## 5. Add production records

1. Sign in with the bootstrapped administrator.
2. Open `/admin/sponsors`.
3. Create a Sponsor Organization.
4. Create its current Sponsorship Agreement.
5. Invite named Sponsor Contacts.
6. Publish shared or organization-specific resources.
7. Ask members to sign in and publish their Member Profiles.

The first release deliberately does not import private records from the old site. Decide the production onboarding and any approved data migration when the new database is ready.

## 6. Verify locally

Use `vercel dev` when testing invitations or notifications because Vite alone does not run files under `api/`.

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Verify at least one account for each role: Sponsor Contact, Helix member, and Sponsor Portal Administrator. Confirm that Bronze cannot browse the Talent Directory, Service cannot enter the portal, and one sponsor cannot read another sponsor's records.

