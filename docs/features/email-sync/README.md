# Email sync fixes and shared signatures

Branch `codex/email-sync` starts at `origin/main` commit `317ad4d64c5760396453e83a9a67cd31dc10d34a`. It implements the requested composer, signature, and unread-state changes for the [Email sync milestone](https://linear.app/helixnmbu/project/helix-member-platform-d4f6b360b4c0).

## Reply and forward composition

The writing area starts empty. The original message renders below it with the existing sandboxed email renderer, preserving HTML layout and falling back to plain text. The close control belongs to the 48-pixel composer header and is centered vertically.

Sending creates a MIME `multipart/alternative` message with UTF-8 plain-text and HTML versions. The server reads the original message from the member's own Gmail connection, sanitizes its HTML, and adds the current shared signature above the quote. Replies preserve Gmail thread IDs and RFC reply references. Client-supplied HTML, member names, and roles cannot override the generated signature.

## Shared signature administration

Open **Settings → Email signature**. Platform Administrators control one design for all members: text, colors, font sizes, bold styling, spacing, optional organization logo, and Helix website/social links. Members can preview their signature but cannot edit the design. The preview resolves placeholders from the signed-in member's current server-side profile.

**Use Helix design** loads the supplied reference layout: a blue bold name, dark navy bold organization and role, phone number, then blue underlined Facebook, Instagram, LinkedIn, and Nettside links separated by vertical bars. These are Helix's organization accounts from the website footer. The default reference design has no logo; administrators can still add one. Loading the design keeps the enabled state and requires saving before it applies to everyone. Existing saved templates retain their text and legacy typography until an administrator changes them.

Supported placeholders are `{member.name}`, `{member.role}`, `{member.phone}`, and `{member.email}`. Name and role come from `identity.members`; the role is `helix_role`, not a platform permission such as administrator. Phone comes from the member's saved profile (`cv.documents.draft.phone`), independently of CV directory-sharing settings. Only the sender's own resolved values are returned, and sending resolves them again on the server. Lines referencing a missing role or phone are omitted. Template text and member values are escaped as text. Colors must be six-digit hex values, font sizes must be 10–40 pixels, and line spacing must be 0–16 pixels. Image and link URLs must use HTTPS. This design update requires no database migration.

All verified members may read the settings and their own rendered signature. Every write checks the current `platform_administrator` role and the linked Google identity on the server. Revision checks reject stale saves. The singleton configuration records its latest editor and update time; it stores no email contents. The signature starts disabled until an administrator configures and enables it.

## Unread investigation and behavior

The previous implementation already sent Gmail `INBOX` and `UNREAD` labels with `q=is:unread`. Adding those filters again would not address the missing read-state lifecycle:

- Opening a message only fetched it. Nothing removed Gmail's `UNREAD` label.
- Cached message details could retain old read-state labels after mailbox updates.
- An empty filtered page hid the next-page control even when Gmail returned a continuation token.

Selecting and opening a message now removes Gmail's `UNREAD` label. Hover and focus prefetch remain read-only. The toolbar also provides **Mark as unread**. Successful mutations update cached details and lists, invalidate requests started before the mutation, and revalidate the current listing. Failed mutations preserve the previous state and provide a retry action in the shared notification.

Initial loading and filter changes do not automatically open messages. The reading pane keeps an opened message visible after it leaves the unread-only list. Manual refresh and window focus revalidate the list. The server and browser both exclude messages whose unread labels changed during retrieval, preserve continuation tokens, and ignore outdated list responses.

Gmail documents read-state updates through [message label modification](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/modify). Outgoing quoted HTML uses the server-side [sanitize-html allowlist](https://github.com/apostrophecms/apostrophe/blob/main/packages/sanitize-html/README.md).

## Database setup before release

Apply `db/migrations/010_member_email_signature.sql` to the intended isolated Neon validation database before testing authenticated signature reads or sending. The migration creates `member_mail.signature_settings`, enables row-level security, and denies direct access to public and browser roles. The server uses the existing database connection and verified member authentication.

Use an untracked `.env.local` with the intended direct Neon connection and existing Gmail/Auth configuration for authenticated local validation. Inspect `npm run neon:setup` before applying its pending migration plan with `npm run neon:setup -- --apply`. Do not point validation at production by accident.

For the user-authorized production release on 26 October 2026, migration 010 was applied transactionally to the `helix-nmbu` project's `main` database branch and recorded in its migration ledger. Row-level security is enabled and public reads are denied. The new table starts empty, so signatures remain disabled until configured by a Platform Administrator.

The signature endpoints share `/api/gmail?action=signature`; there is no new serverless entry point. The local API allowlist also includes the existing member-access endpoint so authenticated local sessions can resolve platform roles.

## Local verification

`npm run dev:member -- --port 5196` starts the development interface on `127.0.0.1`. In this dedicated mode, signed-in local users can exercise a sample inbox and signature editor without network mail actions. These fixtures require both a development build and a loopback origin. Ordinary development, hosted previews, and production continue to require real member authentication. Local signature settings and mailbox mutations last for the running page session.

The local browser checks covered unread-only filtering, opening a message, rendered reply content, close-button placement, and saving a signature with a logo, dynamic name and role, text color, and social links. Service tests exercised the migration twice in PGlite, shared persistence, Google identity matching, administrator-only writes, revision conflicts, and browser-role restrictions. Gmail tests decoded sent MIME and checked quoting, thread headers, escaping, signature insertion, and label modifications with mocked Google responses.

Verification commands:

```sh
npm run lint
npm run typecheck
npm run typecheck:api
npm run typecheck:api:runtime
npx vitest run --maxWorkers=2 --exclude scripts/deployment-guards.test.mjs
node --test scripts/deployment-guards.test.mjs
npm run build
git diff --check
```

The reference-design follow-up passed all 970 tests and three deployment guards, all three TypeScript checks, lint, and the production build. Local browser inspection verified the typography, Helix social links, phone substitution, and administrator save flow. The production build measured 9.20 MB against the 10 MB static-output budget and 10 serverless functions against the 11-function target. Four-worker database runs previously encountered resource-related timeouts; the complete suite passed with two workers. ESLint currently targets JavaScript/JSX; TypeScript files are covered by the TypeScript checks and tests.

The first production smoke check exposed an incompatibility between sanitize-html's ESM-only parser dependency and Vercel's instrumented CommonJS loader. Production traffic was temporarily restored to the preceding deployment. Installation and builds now bundle the current sanitizer and its parser into one generated server module, retaining the current security fixes. The generated file is ignored by Git and traced into the Gmail function. A subprocess regression test disables synchronous require of ESM to reproduce the deployment restriction and checks that sanitization still runs.

Real Gmail delivery and read-state changes still need the member's acceptance check. The browser checks used the dedicated local mode, and Gmail API tests used controlled responses. The user authorized merging this branch into `main` for verification in production and requested that `codex/email-sync` be retained for follow-up PRs. The Linear milestone remains open pending that verification.
