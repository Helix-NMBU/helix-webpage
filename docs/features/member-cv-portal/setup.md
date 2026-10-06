# Member CV portal setup

The PR contains application code and an incremental SQL migration. It does not configure a live Google project, apply SQL, or perform a manual deployment.

## Migration and server configuration

1. Apply the existing `supabase/sponsor-portal-v2.sql` once on a new database. For an existing v2 database, use its current schema. Never rerun the fresh setup script.
2. Review and apply `supabase/member-cv-portal.sql` after v2. Back up existing student profiles and CV objects first. The migration revokes legacy client writes to `students`, `positions` and `member-cvs`. The old upload form must be replaced with this CV editor in the same rollout.
3. Keep `member-cvs` private. The migration enforces a 5 MB limit. The server service role uploads generated PDFs; clients cannot upload or replace CV files.
4. Set server-only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `GOOGLE_CLIENT_ID`. The Google ID must equal the browser `VITE_GOOGLE_CLIENT_ID` and the authorized Supabase Google provider audience. Existing browser Supabase variables remain required. Never prefix the service key with `VITE_`.
5. Enable Google in Supabase Auth. Set the Google OAuth authorized JavaScript origins for the local editor and production origin. Configure Workspace/internal consent and the corresponding Supabase redirect URI in the Google project. Test with real Workspace and personal Google accounts before rollout.

The browser submits its Google credential to `/api/member-login`. The server verifies its signature, issuer, audience, expiry, hosted domain `helixnmbu.no`, verified email and stable Google subject. Supabase exchanges the same credential. The server compares the Google identity to Supabase's linked Google identity before its service role calls `onboard_member_cv`. The browser receives Supabase access and refresh tokens and sets its session. No member allowlist row or administrator flag is created.

Verified identity rows are server-managed. Email suffixes and client-editable `user_metadata` never grant CV access. Existing active membership and administrative roles remain separate. The server checks each request against the current Supabase user, linked Google subject and persisted identity.

## Drafts, publication and storage

`member_cv_documents` contains the authoritative draft and optimistic revision. `member_cv_publications` contains append-only redacted snapshots. `commit_member_cv` locks the owner's document and checks the expected revision. Publication stores the snapshot and updates the existing `students` and `positions` projections in one transaction. Saving a draft does not change sponsor content. Withdrawal removes visibility and the current file path, but retains the member's draft.

Only the member can select their private document through RLS. All direct authenticated inserts, updates and deletes are revoked. The onboarding, mutation, upload-registration and settlement RPCs are executable only by `service_role`. Publication tables, upload candidates and cleanup rows are server-only. The published student row stores a synthetic unique account email. Shared contact information appears only in its consented contact fields and the directory RPC; a hidden Workspace login address is never copied there.

Each shared PDF gets a new UUID path under the owner's folder. Storage policies match only the exact current projection path, never the entire folder. Sponsors also require an active Main, Gold or Silver agreement with `talent_directory=true`. Bronze, Service, expired agreements, non-verified non-members and anonymous requests cannot read generated CVs. Previously expressed interest in an opportunity cannot bypass these file rules.

Replacing or withdrawing a publication atomically queues its previous generated or legacy projected file for deletion. Cleanup runs after a successful read or mutation. A Storage outage leaves the retry record intact and returns the successful document with `cleanupPending=true`. The editor keeps the new revision and directory visibility, shows a separate warning and offers reload to retry. Cleanup never blocks a draft save or withdrawal. It rechecks the document and projection before deletion and preserves the current publication.

Before uploading, `prepare_member_cv_upload` durably registers a fresh candidate path with a 15-minute publication lease. `commit_member_cv` only accepts a pending, unexpired candidate. On an uncertain RPC result, `settle_member_cv_upload` takes the same document lock as publication. It either observes the completed publication or retires the candidate so a delayed original commit cannot adopt it. If settlement also fails, the path remains tracked; a later request settles expired candidates. Uncertain Storage uploads are cancelled for publication immediately but retain a deletion record with `not_before` at least 15 minutes after the uncertain response, allowing delayed bytes to arrive before deletion is retried. Administrators must monitor both `member_cv_upload_candidates` and `member_cv_file_cleanup`, respect `not_before`, and retry pending removals if the member does not return. These tables record paths and state, not private CV text.

Use authenticated Storage downloads for CV viewing. Previously created signed URLs can remain valid until expiry while Storage is unavailable; deletion revokes them. The migration cannot revoke copies that sponsors already downloaded. Do not create new signed URLs for generated CVs.

## Rollout checks

Verify real Google/Supabase login, save/logout/relogin persistence, a second member's denied access and a client-forged metadata attempt. Check publish/save/republish/withdraw and injected storage failures. Confirm current PDFs download for an entitled sponsor and fail for Bronze, Service, expired and anonymous sessions. Confirm replaced/withdrawn paths fail with actual Storage, not just mocked handlers. Inspect the generated PDF for contact consent and Norwegian letters. These live checks remain required even when local unit and SQL-role tests pass.

## Local review and verification

Run `npm ci`, `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`, `npm run lint`, `npm test` and `npm run build`. The source-only NodeNext check verifies that emitted API imports follow Node ESM rules, while the broader API check also validates tests. The SQL-role tests run the actual base and incremental SQL in PGlite PostgreSQL. Only Supabase-owned auth/storage schemas and identities are emulated; the unsupported pgcrypto extension line is omitted because the schema uses built-in gen_random_uuid. This checks database rules and transactions, not live Supabase Auth or Storage transport.

For the isolated fictional editor, run `npm run dev -- --port 5177` and open `/member/profile?demo=1`. The demo persists only in browser-local storage and uses an explicitly labeled HTML preview. It is excluded from production builds. Use `vercel dev` to run the real local API endpoints after configuring a separate test Supabase project. Vite alone does not run the API.

`api/member-cv.ts` runs on Node and bundles `api/_lib/fonts/*.ttf` through vercel.json. The temporary Noto Sans template is separate from stored CV data. Norwegian letters, Latin diacritics, Greek and Cyrillic are supported; unsupported glyphs such as emoji return an actionable validation error. The final reference design and profile image editing are deferred. Publishing keeps an existing profile image unchanged.
