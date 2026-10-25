# Member platform design

- Keep user-facing interfaces in English. For internal.helixnmbu.no and the signed-in sponsor portal, follow shadcn preset `b1Z5baiCQ` (Radix Vega, neutral base, blue theme and charts, Geist, Lucide, small radius, translucent menus with subtle accents). Use the shared components and scoped tokens described in `docs/ui-preset.md`.
- Never add environment labels or banners such as "demo preview", "local preview", "mockup", or "fictional local demo" to the product interface. Put development setup details in documentation and terminal output.
- Use icons only when they help navigation, convey useful status, or identify an icon-only control. Avoid decorative icons in headings and text buttons.
- Keep local test accounts and data restricted to the dedicated development mode on loopback. Production must continue to require real authentication and authorization.
