# Member mail connection setup

The member mail page starts a server-side Gmail OAuth flow at `POST /api/gmail-connect`. The browser sends the verified Neon member JWT in the `Authorization` header; the server creates a short-lived, signed OAuth state cookie and returns the Google authorization URL. No Gmail token or client secret is exposed to the browser.

## Google Cloud configuration

Create a separate OAuth client for the Gmail connection in the Google Cloud project used by Helix:

1. Enable the Gmail API.
2. Configure the consent screen for the Helix internal member platform.
3. Create a Web application OAuth client.
4. Add these exact authorized redirect URIs:

   - Local: `http://localhost:5190/api/gmail-callback`
   - Staging branch (`internal-member-platform-mvp`): `https://helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app/api/gmail-callback`
   - Production: `https://internal.helixnmbu.no/api/gmail-callback`

The app requests `https://www.googleapis.com/auth/gmail.modify`, with offline access so the server can read, send, and refresh access without the member being present.

## Repeatable staging workflow

Use `internal-member-platform-mvp` as the persistent staging branch. Work on feature branches, then open a pull request targeting `internal-member-platform-mvp`. After the pull request is merged, Vercel deploys the branch and updates its stable alias. Test the member mail page at:

`https://helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app/mail`

The staging callback URI must be configured as a branch-specific Preview variable in Vercel:

```text
GMAIL_OAUTH_REDIRECT_URI=https://helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app/api/gmail-callback
```

Keep the Production value set to `https://internal.helixnmbu.no/api/gmail-callback`. Test staging deployments on the stable branch alias so the OAuth request and callback use the same host. Per-commit and feature-branch preview URLs are different hosts and are not the OAuth test target. After staging validation, open a separate pull request from `internal-member-platform-mvp` to the production branch.

The persistent staging branch uses the Neon branch `staging-internal-member-platform-mvp` in project `helix-nmbu`. It was created from a production snapshot, then its member identities, auth sessions and accounts, Gmail connections, and CV records were cleared. Staging has its own private `member-cvs-staging` bucket and branch-scoped storage credentials. Vercel overrides `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_S3_ENDPOINT`, `NEON_STORAGE_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `GMAIL_OAUTH_STATE_SECRET`, and `GMAIL_TOKEN_ENCRYPTION_KEY` for Preview deployments on `internal-member-platform-mvp`; Production values remain unchanged. These database, auth, storage, callback, and token secrets are Production-only by default, so other branch previews cannot access production member data.

Google sign-in uses the Neon Auth branch endpoint. Add this exact authorized redirect URI to the Google OAuth client configured in Neon Auth (this is separate from the Gmail callback above):

```text
https://ep-tiny-night-baltxf20.neonauth.c-8.eu-central-1.aws.neon.tech/neondb/auth/callback/google
```

The stable staging website is already a trusted domain in the staging Neon Auth branch. After adding the Neon Auth callback URI in Google Cloud, sign-in can create staging auth and member rows. Connect only a dedicated test mailbox when validating Gmail send and reply flows.

## Server environment

Set these server-only variables in the Vercel project and local server environment. Never use a `VITE_` prefix for them. Configure staging values as Preview variables scoped to `internal-member-platform-mvp`; keep Production credentials and callback settings scoped to Production.

```text
GMAIL_GOOGLE_CLIENT_ID=...
GMAIL_GOOGLE_CLIENT_SECRET=...
GMAIL_OAUTH_REDIRECT_URI=...
GMAIL_OAUTH_STATE_SECRET=...
GMAIL_TOKEN_ENCRYPTION_KEY=...
```

`GMAIL_OAUTH_STATE_SECRET` and `GMAIL_TOKEN_ENCRYPTION_KEY` must each be generated from at least 32 random bytes. Apply `db/migrations/003_member_gmail.sql` with the direct database connection before enabling the callback in a deployed environment.
