# Member CV portal specification

Feature: member-cv-portal. Revision: 1, 2026-10-06.
Status: approved for delivery of the first CV workflow.
Authorization: the user selected self-service Helix Google Workspace onboarding and draft/self-publication, then invoked `$deliver` on the scoped feature. The proposed field set and separate published versions are implementation defaults from the preceding scope, not separately answered product questions. Final CV styling and profile images remain deferred.
Source: [scope.md](scope.md). Tracker: GitHub Issues, Helix-NMBU/helix-webpage. Parent and child issue numbers will be recorded in delivery.md after publication.

## Requirements

- F-01: A server-verified Google identity with `hd=helixnmbu.no` and verified Helix email can create its own private CV account at first login, without a members allowlist. Reject wrong/missing hd, wrong audience, expired/forged tokens and unverified email. Never grant admin or opportunities access automatically. Use stable Google sub and Supabase user ID.
- F-02: Structured contact, summary, education, experience, Helix roles/projects, skills, languages and links can be edited and durably saved as a private draft. Require name and an education institution/degree only at publication. Preserve unsaved input on failure; session expiry and logout end access. Safely reject malformed/oversized data and unsafe links. Detect stale revisions so concurrent edits do not silently overwrite each other.
- F-03: Generate a readable paginated PDF from submitted CV data. Preserve Norwegian letters, render long text and repeatable entries without truncation, omit empty sections. Never invent content. Preview and personal download are available before publication.
- F-04: Publish an explicit immutable snapshot, independent of subsequent draft saves. Update the existing students/Talent Directory projection only during publication. Support republishing and withdrawal. A member only reads or modifies their own draft; sponsor contacts cannot read drafts or stored contact data outside sharing choices.
- F-05: Sharing choices for CV/email/phone apply in PDF and directory. Published PDFs must be generated on the server from the same validated snapshot, not uploaded client-provided files. Sponsors need an active agreement with talent-directory entitlement; Bronze/Service, expired contracts and unauthenticated users cannot access generated CV files. Use a fresh file path for each version and ensure old files are inaccessible after replacement/withdrawal, including cleanup of any previous generated file.
- F-06: Provide a usable editor on desktop and mobile with clear saved/draft/published status, preview, publish, withdrawal and logout. Include a development-only fictional demo for local browser review, clearly labeled and isolated from live data. Never present the demo as Google/database verification.
- F-07: Document migration order, server/browser variables, Google setup, private storage, role checks and rollout requirements. Do not apply database changes or deploy. Validate integrated code, independent review, and current-commit PR checks. Leave the PR unmerged.

## Shared contract

`src/features/MemberCV/types.ts` defines CvData, CvSharing, CvRecord, CvEnvelope, CvMutation and PdfRenderer. `model.ts` validates and redacts data.

GET /api/member-cv returns CvEnvelope. POST actions save/publish/withdraw return CvEnvelope, require expectedRevision, and use authenticated user ownership. POST action preview returns application/pdf and never mutates stored data. Errors return {error:string}, with 401 for invalid session, 403 for non-verified profile identity, 409 for revision conflict and 400 for invalid input.
POST /api/member-login accepts {credential:string}; verifies Google on the server, authenticates through Supabase, records a server-managed Workspace identity, creates missing private profile, and returns {access_token,refresh_token}. The client sets the Supabase session. No token or service key is logged.

The backend handler takes an injected PdfRenderer. The coordinator wires the completed PDF renderer into api/member-cv.ts after integration. The editor uses the agreed HTTP contract, not direct writes to publication tables.

## Technical boundaries

Use existing React/TypeScript/Vite, Supabase Auth/Postgres/private Storage and Vercel functions. Add incremental SQL after sponsor-portal-v2.sql; do not rerun or destructively replace an existing database. Draft storage is authoritative. public.students is the existing sponsor-facing projection of the published snapshot. No new unrelated sponsor features, import of private member data, profile-image work, payments, external email or deployment.

Base: sponsor-portal-v2 at f99939dfadaa43d869ad6429034608f0bc7f9429. Integration: codex/member-cv-portal. New PR targets sponsor-portal-v2 and depends on unmerged PR #46. Keep PR #46 untouched. Worker branches use codex/member-cv-<ticket> in separate worktrees.

## Tickets and verification

| Ticket | Behavior | Requirements | Blocking dependencies |
| --- | --- | --- | --- |
| T-00 | Shared data contract, validation, privacy defaults and dependency setup | F-02/F-05 | None |
| T-01 | Verified onboarding, durable draft/publication backend and private storage rules | F-01/F-02/F-04/F-05/F-07 | T-00 |
| T-02 | Editor, session/login integration, preview workflow and fictional demo | F-02/F-03/F-04/F-06 | T-00 |
| T-03 | Paginated generated PDF with contact redaction | F-03/F-05 | T-00 |
| T-04 | Runtime wiring, integrated role/database tests, browser review and CI | F-01 through F-07 | T-01/T-02/T-03 |

T-01, T-02 and T-03 develop against the verified shared contract; T-04 provides the final runtime integration. Test Google verification failures and onboarding without an allowlist using injected external services. Run actual PostgreSQL RLS/scenario tests locally if the environment supports it; separately record any missing live Google/Supabase evidence. Inspect actual generated PDF pages. Browser-check demo on desktop/mobile and its create/save/publish/withdraw flow. Run typecheck, API typecheck, lint, tests, build and diff checks. Request fresh full-code review before PR creation. A PR can be ready for code review while live configuration remains a stated rollout prerequisite.
