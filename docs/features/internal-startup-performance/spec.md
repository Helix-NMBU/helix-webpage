# Internal startup and navigation performance

Feature ID `internal-startup-performance`. Henrik approved revision 1 for publication and implementation with `$deliver` on 12 November 2026. The [agreed scope](scope.md) is the source for the requirements and production observations. The tracker is Linear, [Helix member Platform](https://linear.app/helixnmbu/project/helix-member-platform-d4f6b360b4c0), project `P-HELIX-4` in team `HELIX`. The parent is [HELIX-71](https://linear.app/helixnmbu/issue/HELIX-71/reduce-internal-startup-and-navigation-load).

Helix members should reach Internal Home with less JavaScript and move between member routes without loading sponsor data for the sidebar. On 11 November the deployed entry script transferred 424 kB and decoded to 1.39 MB. That sample covers one asset. The acceptance comparison counts all JavaScript required to show Home.

## Acceptance requirements

| ID | Pass condition |
| --- | --- |
| F-01 | The existing authenticated member-access response provides flags for Pipeline, Partner agreements, and Sponsor funding reviews. The flags agree with the current server authorization rules. The sidebar also requires Finance access for its review link. |
| F-02 | Loading Home and navigating between unrelated member routes sends zero sponsor-data requests for sidebar visibility. Opening a sponsor page loads that page's data. Direct URLs and API operations enforce the existing server permissions. |
| F-03 | Member-access flags load at startup and refresh on focus or an access-change event. Overlapping refreshes share a request. Revoked links disappear after refresh. An unavailable response hides affected links and offers retry through shared notifications. An account switch cannot display the prior account's permissions. The loopback fixture uses its configured access rules. |
| F-04 | The JavaScript needed for cold Internal Home and login excludes the public marketing pages, partner portal, and CV editor. The total compressed JavaScript required to reach Home decreases against the verified base build, including eager imports and route chunks. |
| F-05 | Internal Home, login, Google callback handling, CV deep links, and legacy redirects continue to resolve. The public site and partner email OTP entry still work through their own routes and authentication. Lazy transitions use the existing loading UI. |
| F-06 | Delivery records reproducible cold and warm load evidence and the startup request count. With an authorized signed-in session, it also records session lookup, token retrieval, member verification, and requests that start after verification. If a session is unavailable, the record states which timings are missing and reports loopback results separately. |

## Implementation contracts

- Use `GET /api/member-access?action=self` and the current authenticated member identity. Keep its existing account, role, and feature fields. Represent the three sponsor permissions as explicit booleans. Use `partner_deals.capabilities` for Pipeline and shared agreements and `partner_deals.finance_reviewer` for reviews. Treat these booleans as sidebar input. The existing data endpoints continue to authorize their reads and mutations.
- Keep the flags in the existing member access provider. Refresh from the existing access-change event paths and tab focus. Route changes should reuse the current state. Ignore results from an expired request or a previous account. An absent flag cannot grant access.
- Split the static import graph at host selection and the CV route. Inspect indirect imports and shared chunks so a dynamic import actually removes feature code from the entry path. Preserve the single-claim behavior of the Google callback and the host routing rules.
- The work covers sidebar permissions, bundle splitting, and authentication measurement. Changes to authentication request sequencing or unrelated startup data loads require a follow-up decision. Use the existing API entrypoints, with the repository target of at most 11 Vercel functions. Use the existing shadcn/ui theme, English interface copy, and shared notifications.

## Ticket plan

| Ticket | Linear | Behavior | Requirements | Blocked by |
| --- | --- | --- | --- | --- |
| [ISP-01](issues/ISP-01-sidebar-permissions.md) | [HELIX-72](https://linear.app/helixnmbu/issue/HELIX-72/isp-01-build-the-sidebar-from-member-access-flags) | Build the sidebar from member-access flags | F-01 to F-03 | None |
| [ISP-02](issues/ISP-02-split-entry-bundle.md) | [HELIX-73](https://linear.app/helixnmbu/issue/HELIX-73/isp-02-defer-feature-code-until-the-app-or-route-needs-it) | Defer feature code until the app or route needs it | F-04, F-05 | None |
| [ISP-03](issues/ISP-03-verify-integrated-performance.md) | [HELIX-74](https://linear.app/helixnmbu/issue/HELIX-74/isp-03-verify-the-integrated-changes-and-record-timings) | Verify the integrated changes and record timings | F-01 to F-06 | ISP-01, ISP-02 |

ISP-01 owns the member-access service, provider and sidebar. ISP-02 owns host entry points and lazy route boundaries. Both may touch `MemberPlatform.test.tsx`. Coordinate test edits and any provider mounting changes before integrating. ISP-03 needs both changes to measure the integrated behavior.

## Execution and verification

- GitHub and the remote HEAD both report `main` as the default branch. Prepare verified `origin/main` at `3cf4a25`. Refresh and record the comparison base at delivery. Use the existing `codex/internal-startup-performance` branch in `/private/tmp/helix-internal-startup-performance`. If delivery uses worker branches, name them `codex/internal-startup-isp-01` and `codex/internal-startup-isp-02`, with separate clean worktrees based on the agreed integration base.
- Use Node 24 and npm 11.17.0. Run `npm ci` in clean worktrees. Use untracked `.env` or `.env.local` for authorized local services. Use `npm run dev:member` for loopback scenarios. The loopback fixture skips real authentication and does not run in production builds.
- Run focused API and component tests for each ticket. On the integrated branch run `npm test`, `npm run lint`, `npm run typecheck`, `npm run typecheck:api`, `npm run typecheck:api:runtime`, and `npm run build`. The build includes deployment-size and function-count checks.
- Compare the base and candidate with the same build options, JavaScript compression, browser configuration, and cache state. Use the build manifest and browser network log where available. Count distinct JavaScript resources up to Home becoming visible, including entry, preload, shared, and route chunks. Keep transfer size and browser timing separate. Preserve the baseline commit and measurement method in the delivery record.
- Completion requires acceptance evidence, independent review of the integrated diff, and the relevant local checks. When PR creation is authorized, use one PR against `main`, include the measured differences and any missing trace, and verify PR CI. Merge and production release require separate authorization.

## Publication

Revision 1 was published on 12 November 2026. The parent has no implementation label. Each child has the existing `ready-for-agent` label. Linear confirms HELIX-72 and HELIX-73 as the native blockers of HELIX-74. The [delivery record](delivery.md) tracks integration and verification.
