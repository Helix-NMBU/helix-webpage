# Sponsor portal pilot preparation

Prepared 25 October 2026 for HELIX-20, HELIX-21 and HELIX-22. This document records the local setup and acceptance procedure. It does not establish that the sponsor portal is deployed or ready for participants.

## Current decision

The sponsor pilot is **no-go** until the release commit, environment, acceptance evidence, approved agreement matrix, pilot participants, support owner and sign-off owner are recorded below. These are required inputs, not assignments to people who have not agreed to own them.

The starting code is the unmerged Member CV delivery in [PR #62](https://github.com/Helix-NMBU/helix-webpage/pull/62), captured at `60edbc1216df7f16fefe333d7fcdbd3aa1933f4f`. The member service at `internal.helixnmbu.no` uses that delivery. Sponsor work must preserve Google Workspace authentication, private drafts, explicit publication and withdrawal. The old Supabase sponsor proposal in PR #46 is reference material, not the database or authentication baseline.

| Readiness item | Current evidence or missing input |
| --- | --- |
| Sponsor release commit | Not accepted |
| Sponsor hostname and environment | Not selected |
| Member baseline | PR #62 is unmerged; HELIX-10 remains open until acceptance and merge |
| Member session acceptance | Real two-account switching and remaining authentication failure/recovery checks remain in HELIX-8 and HELIX-9 |
| Sponsor agreement matrix | Working S27 matrix checked below; commercial approval remains pending |
| Pilot participants and authorized test recipients | Not named |
| Support owner and operating cover | Not named |
| Release sign-off owner | Not named |
| Integrated sponsor browser/API/storage evidence | Not yet recorded |

Do not close HELIX-20 from a successful shape check, HELIX-21 from isolated tests, or HELIX-22 from writing this checklist.

## Confirmed pilot behavior

Sponsors and explicitly authorized developers sign in through invitation-only, one-time personal email links. An ordinary Helix member account does not grant sponsor access. Members retain their existing Google sign-in. Developers and administrators need explicit privileges; do not infer them from a company email domain.

Talent Directory supports name search and filters for study programme, graduation year, Helix department and skills. It reads current published member content. Email and telephone contact actions appear only when the member shares those fields. CV viewing and downloading use the same current-publication authorization. Draft changes remain private until republished, and withdrawal prevents new sponsor access.

The request types are General collaboration, Thesis/project proposal and Recruitment enquiry. Sponsors see their organization's requests and shared replies. An assigned Helix administrator manages the request. The agreed status vocabulary is Submitted, Under review, Input needed, Completed, Declined and Cancelled. Email notifications are deferred; authentication emails remain necessary. Opportunity publication, member applications, booking, credits and billing are outside this pilot.

The [live S27 package Page](https://chatgpt.com/space/page_6ac0c986147c81918f8afc783907c98d), sequence 143, gives the current working tier matrix. It still describes the commercial model as awaiting internal approval.

| Agreement tier | Sponsor workspace | Talent Directory and shared CVs |
| --- | --- | --- |
| Partner or legacy Service | Denied | Denied |
| Bronze | Allowed during an active agreement | Denied |
| Silver, Gold, Platinum or Main sponsor | Allowed during an active agreement | Allowed during an active agreement |
| Missing, expired or revoked agreement | Denied | Denied |

Do not use the older local package snapshot that starts directory access at Gold. Do not infer a paid add-on or grant access from a label alone. The server must evaluate the stored agreement and its dates for each request.

## Configuration preflight

Use the existing member configuration described in [the Member CV setup guide](../member-cv-portal/setup.md). Add `SPONSOR_PORTAL_ORIGIN` only after choosing the sponsor entry origin. It is an exact origin such as `https://selected-host.example`, with no path or trailing slash. No sponsor hostname is selected by this document.

| Configuration | Scope and checks |
| --- | --- |
| `DATABASE_URL` | Server-only pooled Postgres connection; migrations use a separate authorized direct connection |
| `NEON_AUTH_BASE_URL` | Existing HTTPS managed Auth URL ending in `/neondb/auth`; never the website URL |
| `VITE_NEON_AUTH_URL` | Same-origin `/api/auth`; no browser-side database or storage credentials |
| `GOOGLE_CLIENT_ID` | Existing member Google client; keep member verification unchanged |
| `SPONSOR_PORTAL_ORIGIN` | Exact selected sponsor origin; fixed email callback is `/sponsor` on this origin |
| `NEON_S3_ENDPOINT`, `NEON_S3_REGION`, `NEON_STORAGE_BUCKET` | Existing private member-CV storage; confirm the bucket is private |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Server-only credentials with the intended bucket access |
| `AUTH_PROXY_ALLOWED_HOSTS` | Optional exact hosts only; no wildcards or schemes |

Run the check with values already supplied through the environment:

```sh
node scripts/check-sponsor-config.mjs
```

For explicit loopback development, `--allow-loopback` permits an HTTP sponsor origin on `localhost`, `127.0.0.1` or `::1`. It does not allow LAN HTTP or weaken the required HTTPS URLs for managed Auth and storage. The command does not load `.env`, read credentials from a service, contact any network endpoint, change configuration or apply SQL. It reports key names and validation results without printing their values. A PASS means the supplied values have the expected shape, not that they work.

Enable Magic Link with a five-minute expiry. In the Magic Link section, turn off its own Allow New User Registration option. This setting applies to account creation through magic links; do not disable Google self-service member onboarding globally. [Neon's Magic Link documentation](https://neon.com/docs/auth/guides/plugins/magic-link) documents this plugin-specific control. Provision only approved identities before sending invitations. The application invitation gate and active contact/staff checks remain required; the managed provider endpoint is public and must not be described as private. Existing and newly eligible Helix Google members must remain usable. Register the exact selected sponsor origin in Neon trusted origins. Keep previews distinct from the actual member origin and the selected sponsor origin. Configure and verify custom SMTP before a production pilot. Verify delivery only to an explicitly authorized test recipient.

Before configuring a live origin or provider setting, record the approved environment, exact changes and rollback. Source implementation alone does not authorize DNS changes, deployment, live migrations, authentication changes or invitations.

## Incremental database and recovery procedure

1. Capture the accepted source commit and actual live migration state. Member migrations 001 and 002 are already recorded as applied to the internal environment. Do not rerun them as an assumed sponsor setup step.
2. Review the new sponsor migration against the existing schema. Preserve `identity.members`, CV drafts, current publications and the private bucket. Sponsor organizations, contacts, agreements and explicit staff grants must have separate ownership. Do not copy member profiles into a second authoritative source.
3. Create a recoverable backup or provider snapshot before any authorized live schema change. Record its identifier, timestamp, owner and tested recovery action without recording credentials.
4. Apply the incremental sponsor migration first to an isolated test database or approved isolated Neon branch. Use fictional organizations, invited identities, contacts, agreements and published profiles. Do not clone private member data for a UI demonstration.
5. Verify the schema, constraints, foreign keys, revoked PUBLIC access and the complete permission matrix. Exercise member publication, private edits, republishing, withdrawal and retired file paths after the sponsor migration.
6. Review the isolated migration result and backup recovery test. Record approval before applying the migration to the intended live branch through a direct connection.
7. Deploy the reviewed code only after the server schema and necessary provider configuration are ready. Record migration and release ordering and observe error rates, login outcomes and authorization denials.
8. If the rollout fails, disable new sponsor entry or return hosting to the recorded previous release. Preserve existing member data and sponsor records. Do not drop shared tables or reverse a migration by deleting business records. A database restore may undo newer member writes; its owner must decide the recovery point and reconcile those writes before restoring.

| Rollout evidence | Required record |
| --- | --- |
| Accepted source and previous release | Commit IDs and hosting deployment identifiers |
| Database target and current schema | Project/branch identifiers and observed migration state |
| Backup and recovery check | Snapshot/backup identifier, timestamp, owner and restore-test result |
| Migration review and execution | Reviewed SQL commit, execution timestamp and verification output |
| Auth and origins | Exact trusted origins, plugin/registration settings, SMTP test recipient authorization and result |
| Operating support | Named support owner, contact route and expected response cover |

## Integrated acceptance matrix

Record each result as Pass, Fail or Blocked with the exact commit, hostname, role, date and evidence link. A local fixture check and a live provider check belong in separate evidence rows. Do not store tokens, email-link URLs, personal CV contents or credentials in screenshots, issues or logs.

| Role or scenario | Required observation | Evidence boundary |
| --- | --- | --- |
| Anonymous visitor | No workspace data, profile, request or CV file access; direct APIs reject | Live browser and direct endpoints |
| Unknown or revoked sponsor contact | No active session or sponsor data; a stale client cannot bypass the server check | Provider/app login and direct endpoints |
| Invited sponsor contact | One-time link reaches the selected sponsor origin; replay, expiry and logout behave correctly | Authorized real email/provider test |
| Ordinary Helix member | Google member flow works; member status alone does not grant sponsor workspace access | Member/sponsor role separation |
| Explicit developer | Only the documented developer grants apply; no implicit administrator rights | Staff and organization permission checks |
| Bronze sponsor | Requests/workspace allowed during valid agreement; directory/profile/CV endpoints denied | UI and direct endpoints |
| Partner, legacy Service, expired, missing or revoked agreement | Portal and directory access denied, including already-open pages and direct file calls | Dates/revocation tests plus browser/API |
| Entitled sponsor | Search and each programme/year/department/skill filter use published values; missing optional fields remain browseable without that filter | API data and desktop/mobile browser |
| Published member | Profile and shared CV show the current published revision only | Database/API/private storage |
| Private member draft or private draft edits | No sponsor visibility or leakage through filtering, profile detail, contact fields or PDF | Negative API and actual PDF checks |
| Sharing controls | Hidden email and phone absent from profile response and generated shared PDF; hidden CV has no view/download action and rejects direct file access | API payload plus rendered PDF |
| Republish and withdrawal | New publication replaces sponsor output; withdrawal prevents new access; replaced paths cannot be requested | API/storage lifecycle and browser |
| Issued file URL | Existing authorized URLs expire within the documented bound; downloaded copies cannot be recalled | Actual storage expiry test |
| Cross-organization sponsor | Cannot read, reply to, cancel or update another organization's request, even with a guessed ID | Direct API and database negative cases |
| Sponsor request | Each approved type submits validated data, appears in its organization's history and displays the shared conversation | Sponsor/admin end-to-end |
| Helix administrator | Add/edit organizations, contacts and agreements; revoke contact/access; assign request and use permitted status transitions | Server authorization and desktop/mobile |
| Unauthorized member or sponsor administrator attempt | Every administrative read/write and invalid transition rejects on the server | Direct endpoint negative cases |
| Failure recovery | Loading, empty, filtered-empty, validation, save and service failures remain understandable; failed changes are not shown as saved | Browser with controlled failures |
| Member CV dependency | Google sign-in, reload, draft persistence, preview/download, publish/private edit/republish/withdraw remain intact | Existing suite plus live acceptance |
| Member session switching | Real account A ends access after another tab changes to B, without submitting A's form under B | HELIX-8 human two-account evidence |
| Member authentication failures | Real session expiry, rejected non-Helix identity and service-unavailable/recovery checks | HELIX-9 live evidence |
| Clean responsive interface | shadcn/ui checked before new elements; custom elements justified; navigation, dialogs, controls and overflow usable at desktop and mobile widths | Browser screenshots and component review |

## Go/no-go and support record

Keep the decision no-go while required acceptance or ownership is missing. A complete record includes:

- Decision date, accepted release commit and exact sponsor/member origins.
- Pilot participants and the authorization for any invitations or test emails.
- Named support owner, sign-off owner and escalation route.
- Linked matrix with passed checks and an explicit list of failed or blocked checks.
- Approval of the agreement access matrix and any documented pilot exceptions.
- Migration execution and recovery evidence, previous deployment and rollback instructions.
- Known gaps and separate follow-up issues. Do not silently bring opportunity boards, profile images, bespoke CV redesign or notification emails into this pilot.
- Actual rollout completion time, separate from preparation and the decision to proceed.

HELIX-22 remains open until the required evidence and owners exist. This preparation assigns no pilot participants, changes no DNS, sends no invitations and makes no live go decision.
