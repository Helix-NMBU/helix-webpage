# Helix Webpage

## CV-Bank Google Login

The CV-Bank flow uses Google OAuth and restricts sign-ins to `@helixnmbu.no` accounts. Configure the following environment variables in `.env`:

- `VITE_GOOGLE_CLIENT_ID` — OAuth client ID from Google Cloud (Web application type).
- `VITE_GOOGLE_ALLOWED_DOMAIN` — Allowed email domain (defaults to `helixnmbu.no`).
- `VITE_CVBANK_UPLOAD_URL` — Optional API endpoint to receive CV uploads (expects `multipart/form-data` with `file`, `email`, and `name`).

After setting the variables, run `npm install` (to add Google auth dependencies) and `npm run dev` to start the site.

