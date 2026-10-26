# Internal and sponsor portal UI preset

Use shadcn preset [`b1Z5baiCQ`](https://ui.shadcn.com/create?preset=b1Z5baiCQ) for the member workspace at internal.helixnmbu.no and the authenticated sponsor workspace.

The official CLI decoded the preset and generated the components on 25 October 2026 with shadcn 4.22.1.

| Setting | Value |
| --- | --- |
| Component style | Radix Vega |
| Base colour | Neutral |
| Theme and charts | Blue |
| Body font | Geist |
| Heading font | Inherit |
| Icons | Lucide |
| Radius | Small, 0.45rem base |
| Menu colour | Default translucent |
| Menu accent | Subtle |

`components.json` records the component style and menu settings. `src/libs/components/ui` contains the generated Vega primitives, adapted to the existing `cn` utility and the explicit `theme` prop used by member notifications. The dialog keeps its existing overlay and close-label options, and the member workspace mounts one shared tooltip provider. `src/features/MemberPlatform/member-theme.css` contains the preset's exact light and dark tokens, scoped to member and sponsor workspaces, including Radix portals mounted under the body.

Use these shared primitives and semantic tokens for new workspace UI. Keep the existing member theme preference and provider. Public website colours and exported CV templates retain their own styling.

To regenerate, run `npx shadcn@4.22.1 apply b1Z5baiCQ --yes` in a temporary copy, then integrate the generated primitives and scoped theme. Running the full apply command directly against this repository would overwrite the public website's global palette. Do not replace the existing utility module or introduce a separate theme provider.

## Verification

- All 665 Vitest tests and both deployment guard tests passed.
- Frontend, API and API runtime TypeScript checks passed. JavaScript ESLint passed.
- Production build passed at 9.12 MB, below the 10 MB static output limit.
- Browser checked the member workspace in light and dark modes, profile editing, translucent menus, theme switching, mobile profile layout and mobile sidebar. Sponsor checks covered the directory, shared profile dialog and a programme filter returning one matching member, including a 390px phone viewport without horizontal overflow.
- Browser computed styles confirmed the exact preset primary colours and 0.45rem base radius.
- Public light/dark palette declarations and the printable CV style block are unchanged.

This change is verified locally. Live deployment remains pending.
