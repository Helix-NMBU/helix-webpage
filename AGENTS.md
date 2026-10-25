# Member platform design

- Keep user-facing interfaces in English and use the existing shadcn/ui components and theme.
- Send status, success, warning, and error feedback through the shared app notifications. Do not add inline status banners or dialogs that only display a status message. Include recovery actions in the notification when needed.
- Never add environment labels or banners such as "demo preview", "local preview", "mockup", or "fictional local demo" to the product interface. Put development setup details in documentation and terminal output.
- Use icons only when they help navigation, convey useful status, or identify an icon-only control. Avoid decorative icons in headings and text buttons.
- Keep local test accounts and data restricted to the dedicated development mode on loopback. Production must continue to require real authentication and authorization.

## Staging-first delivery

- Merge every feature implementation and fix into `internal-member-platform-mvp` before considering it complete. Use a pull request targeting this staging branch.
- Test the merged change on the stable staging deployment at `https://helix-webpage-git-internal-member-platform-mvp-helix-nmbu.vercel.app`. Confirm the relevant user flows there before promoting changes.
- Promote changes from `internal-member-platform-mvp` to `main` periodically through a separate pull request after staging validation. Do not send feature branches directly to `main`.
