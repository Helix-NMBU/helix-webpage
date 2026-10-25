# Member mail connection setup

The member mail page starts a server-side Gmail OAuth flow at `POST /api/gmail-connect`. The browser sends the verified Neon member JWT in the `Authorization` header; the server creates a short-lived, signed OAuth state cookie and returns the Google authorization URL. No Gmail token or client secret is exposed to the browser.

## Google Cloud configuration

Create a separate OAuth client for the Gmail connection in the Google Cloud project used by Helix:

1. Enable the Gmail API.
2. Configure the consent screen for the Helix internal member platform.
3. Create a Web application OAuth client.
4. Add these exact authorized redirect URIs:

   - Local: `http://localhost:5190/api/gmail-callback`
   - Production: `https://internal.helixnmbu.no/api/gmail-callback`

The initial connection requests only `https://www.googleapis.com/auth/gmail.readonly`, with offline access so the eventual server-side mirror can refresh access without the member being present. Sending mail should be added later as incremental authorization when that feature is ready.

## Server environment

Set these server-only variables in the Vercel project and local server environment. Never use a `VITE_` prefix for them.

```text
GMAIL_GOOGLE_CLIENT_ID=...
GMAIL_GOOGLE_CLIENT_SECRET=...
GMAIL_OAUTH_REDIRECT_URI=...
GMAIL_OAUTH_STATE_SECRET=...
GMAIL_TOKEN_ENCRYPTION_KEY=...
```

`GMAIL_OAUTH_STATE_SECRET` and `GMAIL_TOKEN_ENCRYPTION_KEY` must each be generated from at least 32 random bytes. Apply `db/migrations/003_member_gmail.sql` with the direct database connection before enabling the callback in a deployed environment.
