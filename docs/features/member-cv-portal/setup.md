# Member CV portal setup

The member CV portal signs in with Neon Managed Better Auth, stores data in Neon Postgres, and stores generated PDFs in Neon Object Storage. It does not use Supabase. Do not commit secrets. Put real values in the local `.env` (gitignored) and in the Vercel project environment.

The provisioned Helix project is `helix-nmbu` (`cool-lake-32274277`, `aws-eu-central-1`, branch `main`). CV tables live in schema `cv`. Shared member identity lives in schema `identity` and points at `neon_auth."user"`. Managed Better Auth already owns `neon_auth`; the migration does not create that schema. This database does not have the older Stack Auth table `neon_auth.users_sync`.

## Environment variables

| Name | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server | Pooled Neon Postgres URL used by the Vercel functions. |
| `NEON_AUTH_BASE_URL` | Server | Managed Better Auth base URL, including the `/neondb/auth` path. Issuer and JWKS are taken from this Neon origin. |
| `VITE_NEON_AUTH_URL` | Browser | Same-origin auth path. Use `/api/auth` on Vercel. The app turns that into the current origin because neon-js requires an absolute URL. |
| `GOOGLE_CLIENT_ID` | Server | Helix Google OAuth client id. The server checks the stored Google ID token audience against it. |
| `NEON_S3_ENDPOINT` | Server | Neon Object Storage S3 endpoint. |
| `NEON_S3_REGION` | Server | Storage region (`eu-central-1`). |
| `NEON_STORAGE_BUCKET` | Server | Private bucket name (`member-cvs`). |
| `AWS_ACCESS_KEY_ID` | Server | Storage access key id, the name used by the Neon storage docs and the AWS SDK. |
| `AWS_SECRET_ACCESS_KEY` | Server | Storage secret access key. |

Empty placeholders are in `.env.example`. Values for this project:

- `NEON_AUTH_BASE_URL`: `https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth`
- `VITE_NEON_AUTH_URL`: `/api/auth` for Vercel preview and production. A local `npm run dev` proxies that path to `NEON_AUTH_BASE_URL`. Leave this as the Neon URL only when you are not using the proxy.
- JWKS, derived by the server from the Neon URL, not the website: `{NEON_AUTH_BASE_URL}/.well-known/jwks.json`
- `NEON_S3_ENDPOINT`: `https://br-super-resonance-ba0eq1wt.storage.c-8.eu-central-1.aws.neon.tech`
- `NEON_S3_REGION`: `eu-central-1`
- `NEON_STORAGE_BUCKET`: `member-cvs`

`GOOGLE_CLIENT_ID` must be the same OAuth client already configured on the Neon auth project. `DATABASE_URL`, `AWS_ACCESS_KEY_ID`, and `AWS_SECRET_ACCESS_KEY` come from the Neon console and stay server-side.

Restart `vercel dev` after changing server variables. Restart `npm run dev` after changing `VITE_NEON_AUTH_URL`.

## Database

Apply `db/migrations/001_member_cv.sql` once, with a direct (unpooled) connection string, against the Helix Neon database. The file is idempotent. The application never runs it. Do not point the migration at a different database.

The pooled `DATABASE_URL` is only for the API. Access control is in the API: the SQL revokes `PUBLIC` privileges and does not enable forced row-level security, because the server connects as the table owner.

## Google sign-in

### Internal member platform routes

On `internal.helixnmbu.no`, `/login` is the Google sign-in page, `/` is the protected member landing page, and `/profile` opens the profile and CV editor. The app verifies the member session before rendering either protected page. The APIs continue to require a verified member bearer token. Marketing routes, the public navbar, the marketing page loader, and the public footer are not rendered on this host.

Old `/member/login`, `/member/profile` and `/cv-bank` links redirect within the internal app and preserve the query and fragment, including Neon's one-time session verifier. The public website keeps its own homepage and routes.

The Vercel project-level rule `36e32a59-b240-4213-ac8f-ab295422d0c8`, which previously redirected the internal root to `/member/login`, must be disabled after deploying this version. It runs before the app's routes and would otherwise intercept direct visits to the protected root.

For local internal-app development, start Vite with `VITE_MEMBER_PLATFORM=true npm run dev`. This override only works in development on localhost or 127.0.0.1. Production selects the member app by its exact hostname.

Authenticated pages use the official shadcn `sidebar-07` block, installed with `npx shadcn@latest add sidebar-07`. Its collapsible sidebar, workspace header, account footer, breadcrumb header and mobile sheet use the block's standard components and layout. Helix labels and routes replace the sample data. Appearance in the account menu offers Light, Dark and System, saved locally under `helix-member-theme`. The default follows the system preference. Theme tokens apply only inside the member app, including portaled menus and dialogs; CV preview documents keep their paper styling. Editor navigation and sign-out use the existing autosave and unsaved-change confirmation.

Login is Google only. The Google redirect URI registered on the OAuth client is:

`{NEON_AUTH_BASE_URL}/callback/google`

For this project that is:

`https://ep-rough-truth-barv8aki.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth/callback/google`

That URI is Neon's callback, not the website. After Google returns, Neon sends the browser to the absolute `callbackURL` on the current origin. The internal app defaults to `/`, can return to `/profile`, and sends sign-in errors to `/login`. Legacy website member routes default to `/member/profile`. Return destinations are validated before being passed to Neon. The origin must be a trusted domain in the Neon Auth console, with the scheme and no trailing slash. Localhost is often already trusted. Add the production Vercel domain and any preview origins that should be able to sign in.

In the Neon Auth console, disable email and password sign-up. The API still rejects a session that is not a verified `@helixnmbu.no` Google account, including a missing or wrong hosted domain, an unverified email, a banned user, or a Google ID token whose audience is not `GOOGLE_CLIENT_ID`. The first successful link stores the Google subject on `identity.members`. Later requests keep that link while the Neon user is still that Google account with a verified Helix email. Changing the email or Google subject requires a fresh valid ID token. A client-supplied `hd` value is ignored.

`/api/auth/:path*` is rewritten to the Vercel function `api/auth.ts` before the SPA fallback. The function reads the remaining path from the `__path` query parameter, because a Vite project does not route `[[...path]]` and the rewrite destination replaces `req.url`. That rewrite stays on this site. It does not forward the browser to Neon, so Vercel does not send this site's host as `X-Forwarded-Host`. The function builds the upstream URL only from `NEON_AUTH_BASE_URL`, drops forwarded host headers, and forwards only the Neon Auth cookies plus the browser's `Origin`. POST, PUT, PATCH, and DELETE must come from the request `Host`, from `helixnmbu.no` or `www.helixnmbu.no`, or from an optional comma-separated `AUTH_PROXY_ALLOWED_HOSTS` list. When `Origin` is absent, `Sec-Fetch-Site: same-origin` is accepted. The function reads the raw body with `bodyParser` disabled. The browser still talks to its own origin (`/api/auth`), which keeps the session cookie first-party. Responses use `Cache-Control: no-store`. Session JWTs are still issued by the Neon origin: `iss` and `aud` are that origin, and the API keeps verifying them with `NEON_AUTH_BASE_URL`. Do not set `NEON_AUTH_BASE_URL` to the website. The Google redirect URI stays `{NEON_AUTH_BASE_URL}/callback/google`. The proxy does not need a cookie secret.

## Files

The bucket `member-cvs` is private. The server uploads only generated PDFs (`application/pdf`, `%PDF-` header, at most 5 MB) under `{memberId}/{uuid}.pdf`. `GET /api/member-cv-file` checks the session and returns a presigned GET that lasts 120 seconds, and only for the caller's current published path. Preview (`POST /api/member-cv` with `action=preview`) returns PDF bytes and does not write storage.

## What is left before members can use it

- Set the environment variables on Vercel.
- Apply the migration.
- Confirm trusted domains and that email/password sign-up is disabled.
- Confirm Neon stores the Google `idToken` on `neon_auth.account` after sign-in. If it does not, the first login fails closed.
- The sponsor Talent Directory, agreement entitlements, and profile images are not in this slice.
