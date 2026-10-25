# Sponsor portal architecture

Status: implementation contract, 25 October 2026. Repository baseline is Member CV PR #62 at `60edbc1216df7f16fefe333d7fcdbd3aa1933f4f`. This contract does not merge, deploy or mutate a live database.

## Identity and access

Use the existing Neon Managed Better Auth provider and same-origin `/api/auth` proxy. Members retain their Google Workspace flow. Sponsors and explicitly authorized developers request a one-time personal email link. An active invitation in `sponsor.contacts` or `sponsor.staff` is necessary. Ordinary Helix membership grants no sponsor access.

`POST /api/sponsor?action=login` accepts an email and requests a managed Magic Link after the server checks the invitation. The server fixes the callback to `SPONSOR_PORTAL_ORIGIN` plus `/sponsor`. It returns the same acknowledgement for unknown and invited email addresses. Raw Magic Link requests through `/api/auth` are rejected; the sponsor form calls the gated endpoint instead. The upstream Neon endpoint is a public authentication service; application authorization remains mandatory even if someone obtains a provider session directly.

Enable the Magic Link plugin on the selected isolated Neon branch. Set link expiry to five minutes and disable the Magic Link plugin's Allow New User Registration option. Do not disable global registration; member Google self-service onboarding must continue. An authorized operator provisions the invited provider identities. Use managed delivery; configure custom SMTP before production. Keep Google and member origin settings intact. No custom token issuer or second member authentication service is introduced.

`GET /api/sponsor?action=session` returns a `SponsorContext` after verifying the signed Neon token and querying the current verified, unbanned Neon identity, invitation, organization and agreement. The initial verified email claim binds each invitation to a stable Auth user ID atomically. Later mismatches fail. Every protected API call repeats current access checks; client roles and organization IDs are never authority.

The shared module `api/_lib/sponsor-access.ts` exports `SponsorError`, `SponsorDatabase`, `sponsorDatabase`, `createSponsorAccess`, `requirePortal`, `requireDirectory`, `requireAdmin` and `sponsorBearer`. Access services expose `authenticate(token)` and `mayRequestLogin(email)`. The context contains `authUserId`, `email`, `contactId`, `organizationId`, `organizationName`, `role`, `portal` and `directory`. The frontend owns no authoritative grant cache.

An administrator is an explicit active `sponsor.staff` grant. A developer grant permits sign-in but does not imply administrator rights. Staff must also have an active contact and agreement to use sponsor data. Staff without an entitled organization can use authorized administration only. Developer access never opens private member drafts.

## Data and agreement contract

Migration 003 adds only `sponsor.organizations`, `sponsor.contacts`, `sponsor.agreements` and `sponsor.staff`. Each contact belongs to one organization. Email addresses are normalized and unique. One agreement holds the current tier, inclusive start instant, exclusive end instant and optional revocation instant for an organization. Organization/contact deactivation and agreement changes take effect on the next API check. Use UTC instants for agreement boundaries.

The current package working model gives Partner and legacy Service no portal access, Bronze portal access, and Silver, Gold, Platinum and Main both portal and Talent Directory. The live S27 package Page, sequence 143, supports this mapping. Commercial approval remains required before rollout. No prices or extra deliverables are inferred.

Directory/profile/file APIs share `requireDirectory`. Request APIs share `requirePortal` and organization isolation. Administration shares `requireAdmin`. A permitted file path must be the current published revision, with CV sharing enabled. Reuse the private storage mechanism and its 120-second download expiry. Previously downloaded bytes cannot be recalled.

## Published member data

`identity.members` and `cv.documents` remain member-owned. Sponsors read visible `cv.directory_entries` joined to the matching `cv.publications` revision. A profile response and directory filters read that published snapshot, never `cv.documents.draft`. The directory supplies name search and study programme, graduation year, Helix department and skills filters. Missing optional values remain browseable. Quick contact uses shared email/phone links only. Withdrawal, republishing and contact redaction remain authoritative.

## Ownership and delivery

- HELIX-11/12/13 own this contract, migration 003, access checks and sponsor email authentication.
- HELIX-14/15 own published member queries, filtering and authorized CV view/download.
- HELIX-16 owns administrator controls against these tables. It cannot create staff grants through a public self-service path.
- HELIX-17/18 own the request model, its additional migration and server transitions.
- The coordinator owns `/api/sponsor.ts` composition and application routes. Keep one sponsor API function.
- HELIX-20 owns reviewed configuration/migration and recovery instructions. HELIX-21/22 record acceptance and rollout state without substituting local tests for live evidence.

No sponsor hostname is selected. `SPONSOR_PORTAL_ORIGIN` must be an explicitly configured HTTPS origin. Production requires trusted-origin/provider configuration, approved package rules, authorized administrator bootstrap and real sponsor/member/admin acceptance. Member acceptance HELIX-8/9 and merge readiness HELIX-10 remain independent prerequisites for the integrated pilot.

Sources: [Neon Magic Link](https://neon.com/docs/auth/guides/plugins/magic-link), [current package Page](https://chatgpt.com/space/page_6ac0c986147c81918f8afc783907c98d), [Member CV PR #62](https://github.com/Helix-NMBU/helix-webpage/pull/62). Provider sessions use short-lived signed JWTs. Sign-out clears the browser/provider session; an already-issued JWT remains valid until its expiry. Contact/staff revocation and current agreement checks still deny each API immediately.
