# Internal startup and navigation performance

Status is `ready-for-prepare`. Henrik agreed to scope the sidebar and bundle changes on 12 November 2026. The implementation branch starts at `origin/main` commit `3cf4a25`.

## Problem and outcome

Helix members wait when they open Internal and generate extra network traffic as they navigate. On 11 November, the deployed HTML took 60–73 ms in two checks. Its JavaScript entry was 424 kB over the wire and 1.39 MB decoded. The unauthenticated session endpoint took 330–520 ms. These samples give context for the initial load. A signed-in browser trace is still needed to attribute the wait before Home appears.

The first pass reduces the JavaScript needed to open Internal and removes the three sponsor-data requests used to build its sidebar.

## Sidebar permissions

- Extend the existing `/api/member-access?action=self` response with permission flags for Pipeline, Partner agreements, and Sponsor funding reviews. Derive them from the same server-side rules as the respective data endpoints. `partner_deals.capabilities` provides the Pipeline and shared-agreements grants. `partner_deals.finance_reviewer` provides the review grant.
- Read the flags from the signed-in member's access state. Load them at startup and refresh when the tab regains focus or the app receives an access-change event. Coalesce overlapping refreshes. Keep ordinary route changes independent of permission refreshes.
- Load the sponsor records on their respective pages. The server checks access on direct visits and on every protected read or mutation. Keep the existing Finance requirement for showing Sponsor funding reviews in the sidebar.
- When permissions are unavailable, hide the affected links and use the shared access error notification and retry action. Reset permission state when the signed-in account changes. Preserve the loopback development mode's role and access controls.

## JavaScript loaded on entry

- Split the app at the host and route boundaries so Internal Home and login do not load public marketing pages, the partner portal, or the CV editor. Check the static import graph for indirect imports that would pull those modules into the entry path.
- Preserve deep links, legacy redirects, Google sign-in and callback handling, and the separate partner email OTP flow. Use the existing loading UI during lazy route transitions.
- Compare equivalent production builds and browser settings. Count the total compressed JavaScript required to show Internal Home on a cold load, including imported chunks. Confirm the total falls and that deferred features load when opened.

## Session timing and boundaries

Capture a signed-in cold-load trace if an authorized session is available. Report the time spent on session lookup, token retrieval, member verification, and requests started after verification. Report the loopback comparison separately because local member mode skips real sign-in.

The agreed first pass covers sidebar permissions, bundle splitting, and measurement of the existing authentication flow. Consolidating authentication or changing other startup data loads would be a follow-up decision based on the trace. Use the existing API entrypoints and keep the Vercel function count within the repository budget. Validate locally. Production release requires separate authorization.

## Local acceptance

- Open Internal Home, then navigate between unrelated member routes. The browser makes zero sponsor-data requests for sidebar visibility during startup or those transitions. It requests the relevant data when an authorized member opens each sponsor page.
- Check a member with no sponsor access, a member with agreements-only access, a Pipeline member, and a finance reviewer. Verify the visible links against the existing rules. Check direct navigation, revocation after refresh, and access-response failure and recovery.
- Compare cold and warm startup, verify Internal login and Home, and smoke-test a CV deep link, the public website, and partner login. Run the affected tests and the production build, including the existing deployment guards.

## Code references

- [App entry and host selection](../../../src/App.tsx)
- [Internal routes](../../../src/features/MemberPlatform/MemberPlatform.tsx) and [member session bootstrap](../../../src/features/MemberCV/session.ts)
- [Sidebar permission probes](../../../src/libs/components/app-sidebar.tsx) and [member feature access provider](../../../src/features/MemberPlatform/MemberFeatureAccess.tsx)
- [Member access service](../../../api/_lib/member-access-service.ts) and [partner deal authorization](../../../api/_lib/partner-deals-service.ts)
- [Repository instructions](../../../AGENTS.md) and [member platform glossary](../../../CONTEXT.md)

The scope has no blocking product decisions. Prepare can set the measurement procedure and implementation order from this document.
