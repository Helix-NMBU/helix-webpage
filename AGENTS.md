# Member platform design

- Keep user-facing interfaces in English and use the existing shadcn/ui components and theme.
- Send status, success, warning, and error feedback through the shared app notifications. Do not add inline status banners or dialogs that only display a status message. Include recovery actions in the notification when needed.
- Never add environment labels or banners such as "demo preview", "local preview", "mockup", or "fictional local demo" to the product interface. Put development setup details in documentation and terminal output.
- Use icons only when they help navigation, convey useful status, or identify an icon-only control. Avoid decorative icons in headings and text buttons.
- Keep local test accounts and data restricted to the dedicated development mode on loopback. Production must continue to require real authentication and authorization.

## Reuse UI behavior

- Before adding or changing an interaction, look for an existing Helix implementation in `src/libs/components/ui` and related features. Reuse suitable shared shadcn components and Radix behavior first.
- When a shared control does not cover the interaction, use `node_modules/@ui-sdk/react/docs/llms.txt` to find the SDK's components and behaviors before writing custom keyboard navigation, focus, selection, dismissal, or drag and drop. Reuse the smallest component or behavior that fits. For custom composition, use the component authoring guidance in `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md`.
- Use Helix components and theme tokens for presentation. Keep workflow rules and persistence in the feature. Verify the affected keyboard and pointer flows, including focus and dismissal where applicable.

## Local validation and delivery

- Validate changes locally using an untracked `.env` or `.env.local` file. Hosted staging is no longer part of the delivery workflow.
- Keep Hobby deployments below Vercel's 12-function cap: target at most 11 functions and consolidate API entrypoints before adding another. `scripts/check-vercel-functions.mjs` enforces this budget against both source routes and generated deployment functions.
- Use Neon for application data, authentication, and object storage. Do not add Supabase dependencies or import legacy Supabase records.
- Keep partner email OTP access separate from Google Workspace member authorization. A valid authentication session alone does not grant partner, recruiter, or administrator permissions.
- Run relevant checks and inspect changed interfaces locally before a production release. Publishing and deploying require the user's authorization.
