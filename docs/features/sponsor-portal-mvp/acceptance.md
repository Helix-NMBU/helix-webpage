# Sponsor portal MVP

Approved implementation scope: 25 October 2026. Tracker: https://linear.app/helixnmbu/project/sponsor-portal-mvp-86670fe706a7.

## Baseline and boundaries

Use the existing Neon Member CV implementation in PR #62 at `60edbc1216df7f16fefe333d7fcdbd3aa1933f4f`. PR #46 is a conflicted historical Supabase proposal, not the implementation base. Member CV stays owned by Helix member Platform. Preserve member Google Workspace login, private drafts, explicit publication/republishing/withdrawal and contact/PDF sharing choices.

The user first requested parallel cloud conversations, then explicitly changed the request to local implementation. Work in isolated detached checkouts. Do not create or switch named branches, push, merge or deploy without the corresponding authorization. Existing user work remains untouched.

## Sponsor access

Only invited active sponsor contacts and explicitly authorized developers may sign in through one-time personal email login. Ordinary Helix member access never grants sponsor access. Use managed authentication; keep identity verification separate from organization, agreement and administrator authorization. Enforce all permissions on the server for every request.

Current package source: https://chatgpt.com/space/page_6ac0c986147c81918f8afc783907c98d, sequence 143, read on 25 October. Partner and legacy Service have no portal. Bronze has portal only. Silver, Gold, Platinum and Main have Talent Directory. This is the current working matrix; commercial approval remains a rollout requirement. Deny missing, future, expired and revoked agreements and inactive contacts.

## Talent Directory

Browse all eligible explicitly published profiles. Search names and filter by study programme, graduation year, Helix department and skills. Read the current published snapshot, never a private draft or identity record as a substitute. Show member detail, currently shared CV view/download, and shared email/telephone links. Missing optional filter values do not hide members from an unfiltered directory. Do not infer department from free-text job titles.

Both file actions enforce the same current publication, consent and agreement checks. Withdrawal and republishing prevent new access to retired versions. Explain the expiry of already issued links and the inability to recall downloaded copies.

## Sponsor requests

Types: General collaboration, Thesis/project proposal, Recruitment enquiry. Statuses: Submitted, Under review, Input needed, Completed, Declined, Cancelled. Sponsors create and follow their organization's requests. An assigned authorized Helix administrator manages each request; both sides exchange shared replies inside the portal. Email notifications are deferred. Authentication email remains required.

Record validated fields and actor/state transitions in requests.md before implementation. Opportunity boards, member applications/responses, booking, proposal credits, billing, profile photos and bespoke CV redesign remain deferred.

## Administration and UI

Authorized administrators manage organizations, named contacts, activation and agreement tier/dates. Developer access is an explicit grant, not an entitlement bypass or implicit administrator role. Use fictional records for development; do not import real sponsor records.

Follow AGENTS.md. Interfaces use English and the existing theme. Check shadcn/ui before adding an element; reuse suitable existing components. Record any necessary custom controls. Cover loading, empty, filtered-empty, errors, validation and save conflicts. Verify desktop and mobile in a browser.

## Verification and pilot gates

Run the affected tests, frontend/API/runtime typechecks, lint and build. Verify authorization against actual SQL in an isolated database and browser behavior with isolated fictional fixtures. Fixtures must be unavailable outside a dedicated loopback development mode.

HELIX-20 prepares configuration, incremental migration and recovery instructions. Do not mutate live services or send invitations without rollout authorization. No sponsor hostname has been selected. HELIX-21 requires integrated evidence from configured member, sponsor and administrator roles. HELIX-22 requires named pilot participants, support and sign-off owners. Keep live acceptance incomplete when those prerequisites are missing.

Real-account/session acceptance remains in HELIX-8 and HELIX-9. HELIX-10 stays open until accepted PR #62 merges. Local tests do not close those cross-project tasks.
