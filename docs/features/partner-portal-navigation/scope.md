# Partner portal navigation and pages

Status: ready-for-prepare  
Date: 26 October 2026  
Project: Linear Partner portal MVP (P-HELIX-3)

## Problem

The live partner portal authenticates sponsor contacts at `partner.helixnmbu.no`. After sign-in, the active app renders the Talent Directory as its only page. There is no sidebar or accessible Engagement Requests page, so sponsors cannot reach the request and follow-up workflow from the live platform.

## Users and outcome

Authorized partner contacts need to move between the Talent Directory and Engagement Requests in the authenticated partner workspace. Helix administrators need to continue receiving, assigning, responding to, and tracking those requests through the agreed workflow.

## Confirmed behavior

- Keep the current invitation-only email one-time-code sign-in, Neon session, partner organization checks and sign-out flow.
- After authentication, provide a shadcn/ui-based responsive sidebar with `Talent Directory` and `Engagement Requests` links. Show the active page and close the mobile navigation after a normal selection.
- The Talent Directory remains the initial authenticated destination. The Engagement Requests page uses the name supplied by the user.
- Show each destination only when the signed-in contact has the corresponding current agreement entitlement. Direct URL navigation and every API operation must enforce the same authorization on the server.
- Reuse the request types, fields, statuses, transitions, assignment and shared-history rules already confirmed in HELIX-17 and `docs/features/sponsor-portal-mvp/requests.md`. Do not re-scope those decisions.
- Preserve organization isolation: derive organization and author from the authenticated server-side session and never accept them from the client as authority.
- Use shared app notifications for operation feedback and existing shadcn/ui components and theme.
- A revoked or expired session returns to sign-in. A denied page or request action does not expose another organization's records.

## Current implementation evidence

- `src/App.tsx` mounts `PartnerPortal` for the `partner` host.
- `src/features/PartnerPortal/PartnerPortal.tsx` renders `PartnerDirectoryView` after authentication and has no workspace navigation or request page.
- `api/_lib/partner-handler.ts` currently supports OTP request, session, directory and CV download actions. The current partner repository has no request actions.
- `src/features/SponsorWorkspace/SponsorShell.tsx` and `RequestsPanel.tsx` contain a responsive sidebar and request UI, but `SponsorWorkspace` is not mounted for the partner host. Its transport is the older sponsor API and must be adapted to the active partner session and authorization contract before reuse.
- The deployed directory currently supports name, study field and graduation-year filtering plus CV download. The broader accepted HELIX-14 scope also includes department and skills filters, member profile details, and links only for contact fields members chose to share. Track that parity in HELIX-14; this scope does not remove those requirements.
- The local/remote `codex/sponsor-directory-milestone` candidate has no commits ahead of current GitHub `main` (the comparison reports 0 ahead and 32 behind). Its code is already in main; it is not a merge candidate. No open PR exists for that branch.
- PR #46 (`sponsor-portal-v2`) remains an old draft based on Supabase and an obsolete auth/data model. Do not merge it into the current Neon partner portal.

## Acceptance criteria

- An authenticated entitled contact can open both pages from the sidebar on desktop and mobile; the current page is announced and highlighted.
- Direct entry to a page follows the same entitlement checks as its sidebar link.
- The directory keeps its existing authorization and publication rules.
- A sponsor can submit an agreed request, view their organization's requests, and follow shared replies and status history. Helix administrators can manage requests according to the existing assignment and transition rules.
- Requests use the active partner authentication/session and current server-side organization authorization; cross-organization reads and writes are denied.
- Sign-out, expired sessions and revoked access continue to work from either page.
- Verify the full sponsor and administrator flow, including entitlement boundaries and organization isolation, in the local configured environment and on desktop/mobile browsers.

## Exclusions

Opportunity boards, member applications or responses, workshop booking, billing/proposal credits, in-app messaging, new authentication providers, and changes to the agreed request workflow are excluded. No migration is assumed until implementation review proves one is needed.

## Decisions and open questions

The destination names, responsive sidebar, initial directory destination, current auth provider, authorization boundaries and request workflow are settled by the user's request, the live implementation and HELIX-17. URL path names and whether an existing request API component can be safely adapted are implementation choices for Prepare. No product decision blocks preparation.

## Linear tracking

- [HELIX-30](https://linear.app/helixnmbu/issue/HELIX-30/expose-talent-directory-and-engagement-requests-in-the-partner-portal) tracks the responsive workspace navigation and the integration of Engagement Requests with the active partner authentication and authorization.
- [HELIX-14](https://linear.app/helixnmbu/issue/HELIX-14/build-a-filterable-talent-directory-with-shared-cvs-and-quick-contact) and [HELIX-15](https://linear.app/helixnmbu/issue/HELIX-15/authorize-sponsor-access-to-the-current-published-cv-file) were returned to In Progress after comparing their accepted criteria with the active partner host. The earlier local verification remains recorded; the live page still lacks some approved directory behavior and CV viewing.
- [HELIX-17](https://linear.app/helixnmbu/issue/HELIX-17/define-sponsor-request-types-and-the-helix-response-workflow) remains the source for the agreed request contract.
- The Linear project overview and milestone descriptions were updated with the live-host findings. The Talent Directory milestone is 63%, Sponsor collaboration requests is 67%, and Pilot ready remains 17%.
