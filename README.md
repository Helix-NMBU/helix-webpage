# Helix Webpage

## Local member platform

Run `npm run dev:member`, then open http://127.0.0.1:5190/profile. Home, Profile, Settings and team navigation use the normal member-platform routes.

This command opens a local Admin account, Alex Example, with sample CV data. Profile edits, sharing choices and publication state persist in this browser. Sign-out and sign-in use the local account. CV previews render in the browser; PDF downloads and external services require the configured application.

The local account works only in Vite's `member-local` development mode on loopback. It does not use Google, Neon or production data, and it cannot bypass authentication in a production build. Keep environment explanations in documentation and terminal output, not in the product UI.

## Member CV portal

Members edit a private CV at `/member/profile` and sign in with a Helix Google Workspace account through Neon. Environment variables, the Google redirect URI, and the SQL migration are documented in [docs/features/member-cv-portal/setup.md](docs/features/member-cv-portal/setup.md).

## CV-Bank Google Login

The CV-Bank flow uses Google OAuth and restricts sign-ins to `@helixnmbu.no` accounts. Configure the following environment variables in `.env`:

- `VITE_GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud (Web application type).
- `VITE_GOOGLE_ALLOWED_DOMAIN` — Allowed email domain (defaults to `helixnmbu.no`).
- `VITE_CVBANK_UPLOAD_URL` — Optional API endpoint to receive CV uploads (expects `multipart/form-data` with `file`, `email`, and `name`).

After setting the variables, run `npm install` and `npm run dev` to start the site.

## Email (Resend)

The contact form and recruitment rejection emails are sent server-side via [Resend](https://resend.com), through the Vercel functions in `api/contact.ts` and `api/reject.ts`. These variables are server-only (no `VITE_` prefix) and must be set in `.env` for local `vercel dev` and in the Vercel project's Environment Variables for deploys — never in client code:

- `RESEND_API_KEY` — Resend API key (sending access, scoped to the `helixnmbu.no` domain).
- `CONTACT_TO_EMAIL` — Inbox that receives contact form submissions.
- `CONTACT_FROM_EMAIL` — Verified sender address (defaults to `no-reply@helixnmbu.no`).

Sending only works once `helixnmbu.no` is verified in Resend (DNS records added and propagated). `api/reject.ts` also requires the caller to be an authenticated, active recruiter (checked via Supabase's `is_recruiter()`), so it can't be used to email arbitrary addresses.

Local testing of the `api/*` functions requires `npx vercel dev` instead of `npm run dev`, since plain Vite doesn't run Vercel serverless functions.

