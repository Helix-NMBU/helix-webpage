# Legacy sponsor portal branch review

Reviewed 25 October 2026. Recommendation: adapt the sidebar layout; retain the current Neon implementation. A wholesale merge would reintroduce incompatible authentication, data ownership and request workflows.

## References and fixed comparison

- [PR #46, Sponsorportal v2: forslag til retning](https://github.com/Helix-NMBU/helix-webpage/pull/46) is open, draft and unmerged. GitHub reports it unmergeable against main. Its branch is `sponsor-portal-v2`, verified head `f99939dfadaa43d869ad6429034608f0bc7f9429`.
- [PR #37, Sponsor links](https://github.com/Helix-NMBU/helix-webpage/pull/37) is already merged and does not supply the proposed portal workspace.
- Current integration point: `080d348a4d96160331c521d258959bb6787f9ffe`.
- Candidate commits: `4154760` Build sponsor portal v2; `0881237` Expand sponsor portal workflows; `f99939d` Refine sponsor login and request statuses.

```sh
git diff 080d348a4d96160331c521d258959bb6787f9ffe...f99939dfadaa43d869ad6429034608f0bc7f9429
git log 080d348a4d96160331c521d258959bb6787f9ffe..f99939dfadaa43d869ad6429034608f0bc7f9429 --oneline
```

`git merge-tree --write-tree --name-only` simulated integration without changing the checkout. It reports 32 conflicted paths, including routing, member authentication, dependency manifests, deleted legacy member files, Vite/Tailwind configuration and shared UI primitives. The conflict count is separate from the semantic findings below.

Two independent read-only reviewers assessed Standards and Spec. Candidate locations below refer to `f99939d`. Findings against today's requirements describe integration blockers, rather than assuming the historical proposal was intended to meet later decisions.

## Standards

Three blockers against the current documented standards:

- Preset mismatch. `src/features/Portal/portal.css:1-27` hard-codes a light palette and blue sidebar; line 63 selects system typography. Current `AGENTS.md` and `docs/ui-preset.md` require preset `b1Z5baiCQ`, Geist, shared semantic tokens and both light/dark modes. Reuse the layout through the current shared components and theme.
- Fixture mode lacks the required restriction. `src/features/Portal/PortalAuth.tsx:50-56,100-104` enables sample accounts through `import.meta.env.DEV` and session storage alone. `AGENTS.md` requires dedicated development mode on loopback. Keep the current `SponsorWorkspace/local.ts` guard instead.
- Environment labels appear in the product. `src/features/Portal/PortalShell.tsx:83` renders `"Preview mode"`; `SponsorLogin.tsx:81-82` exposes `"Preview with sample data"`. These conflict with the explicit environment-label rule in `AGENTS.md`.

The sidebar composition is reusable, but the shell needs a mobile repair. `PortalShell.tsx:36` controls desktop opening with `open onOpenChange={() => undefined}` and provides no `SidebarTrigger`. The corresponding mobile implementation initializes `openMobile` to false and renders its sheet from that state in `src/libs/components/ui/sidebar.tsx:75,199-201`. Mobile users therefore have no visible opener. Add a trigger and close the mobile sidebar after navigation.

No additional smell-only findings warrant blocking reuse.

Recommendation: adapt `PortalShell`'s sidebar/content/footer composition to the current route-based workspace, verified entitlements and sign-out flow. Do not merge the branch's auth, theme, fixture handling or older UI primitives wholesale.

## Spec

Five integration findings:

1. Authentication and routes conflict. Current architecture says "Use the existing Neon Managed Better Auth provider and same-origin `/api/auth` proxy." Legacy `src/features/Portal/PortalAuth.tsx:66-80` reads Supabase sessions/context, and `src/App.tsx:56-68` installs `/portal` and the older member routes. These cannot replace the current `/sponsor` implementation.
2. Published CV ownership conflicts. Acceptance requires "Read the current published snapshot, never a private draft or identity record as a substitute." Legacy `supabase/sponsor-portal-v2.sql:394-409` reads mutable `public.students`; lines 414-425 authorize CVs through those records. Its student schema at lines 94-111 has no publication revision. Keep current Neon publication/file APIs.
3. Request workflow and scope conflict. Acceptance specifies the six current statuses and defers opportunity boards, member applications/responses, booking, proposal credits and billing. Legacy SQL lines 6-10 introduce different workflow enums and opportunity/engagement models; `Sponsorportal.tsx:84-88` loads those models, and lines 37-44 invoke email notifications that the current request spec explicitly defers.
4. Tier matrix is obsolete. Acceptance includes Partner and Platinum. Legacy `supabase/sponsor-portal-v2.sql:5` and `entitlements.ts:9-14` omit them. Its agreement checks at SQL lines 260-277 use inclusive calendar-date boundaries, versus current UTC instants and an exclusive end.
5. The legacy sidebar is incomplete on mobile. Current acceptance requires browser verification on mobile. `PortalShell.tsx:36` forces the sidebar open with a no-op change handler; line 37 uses offcanvas mode, but there is no `SidebarTrigger` anywhere under the candidate's `src/features`. Phone users cannot open its navigation.

Recommendation: adapt the sidebar composition from `PortalShell.tsx:37-86`, including grouped navigation and the organization footer. Keep the current context, entitlements, routes, preset components, APIs and database. Add a functional trigger and close the mobile sheet after navigation. Do not merge the branch wholesale.

Standards: 3 documented-standard blockers; the fixture restriction is the most consequential. Spec: 5 integration findings; incompatible authentication and publication ownership are the most consequential. Reviewed candidate: `f99939dfadaa43d869ad6429034608f0bc7f9429`.

## Integration performed

`SponsorWorkspace/SponsorShell.tsx` adapts the legacy composition using the current Vega components. It provides a collapsible desktop sidebar, a mobile trigger and sheet that closes after normal navigation, active route indicators, a breadcrumb, and an organization/account footer. Destinations remain conditional on the verified context: Talent Directory, Collaboration requests and administrator-only Administration. The account menu exposes the existing theme preference and sign-out flow. It does not introduce extra legacy destinations or backend models.

The current session checks, per-operation authorization, request state and publication APIs remain the source of truth. No GitHub merge, provider change or database migration is part of this adaptation.

## Adaptation verification

- `npm test`: 670 Vitest tests and two Node deployment tests passed. New coverage checks the four navigation permission combinations and sign-out failure followed by a successful retry. Existing revocation and unsent-reply tests still pass.
- Frontend, API and API-runtime TypeScript checks, JavaScript ESLint and production build passed. Static deployment output remains 9.12 MB under the 10 MB limit.
- Desktop browser: expanded/collapsed sidebar, active directory route, account menu, light/dark palette, and administrator-only destination verified. A fresh sponsor load produced no browser errors.
- At 390px, the visible trigger opened the sheet. Following Collaboration requests navigated to `/sponsor/requests`, removed the sheet, and kept document width at 390px without overflow.
- Both independent reviewers also inspected the stable adaptation against `080d348` before commit. Standards and Spec each found zero actionable issues in the adaptation. The historical-branch findings above remain separate.

Local screenshot artifacts: `/private/tmp/helix-sponsor-shadcn-sidebar-desktop.jpg` and `/private/tmp/helix-sponsor-shadcn-sidebar-mobile.jpg`. Screenshots are not committed. Deployment remains pending.
