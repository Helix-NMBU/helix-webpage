# Helix Webpage

## CV-Bank Google Login

The CV-Bank flow uses Google OAuth and restricts sign-ins to `@helixnmbu.no` accounts. Configure the following environment variables in `.env`:

- `VITE_GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud (Web application type).
- `VITE_GOOGLE_ALLOWED_DOMAIN` — Allowed email domain (defaults to `helixnmbu.no`).
- `VITE_CVBANK_UPLOAD_URL` — Optional API endpoint to receive CV uploads (expects `multipart/form-data` with `file`, `email`, and `name`).

After setting the variables, run `npm install` (to add Google auth dependencies) and `npm run dev` to start the site.

## Email (Resend)

The contact form and recruitment rejection emails are sent server-side via [Resend](https://resend.com), through the Vercel functions in `api/contact.ts` and `api/reject.ts`. These variables are server-only (no `VITE_` prefix) and must be set in `.env` for local `vercel dev` and in the Vercel project's Environment Variables for deploys — never in client code:

- `RESEND_API_KEY` — Resend API key (sending access, scoped to the `helixnmbu.no` domain).
- `CONTACT_TO_EMAIL` — Inbox that receives contact form submissions.
- `CONTACT_FROM_EMAIL` — Verified sender address (defaults to `no-reply@helixnmbu.no`).

Sending only works once `helixnmbu.no` is verified in Resend (DNS records added and propagated). `api/reject.ts` also requires the caller to be an authenticated, active recruiter (checked via Supabase's `is_recruiter()`), so it can't be used to email arbitrary addresses.

Local testing of the `api/*` functions requires `vercel dev` (or `npx vercel dev`) instead of `npm run dev`, since plain Vite doesn't run Vercel serverless functions.

