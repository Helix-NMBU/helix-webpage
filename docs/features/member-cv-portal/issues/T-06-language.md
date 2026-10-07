# T-06: Norwegian/English member interface

Local follow-up, parent #51, existing PR #57, spec revision 3, F-06/F-08/F-09. User requested Norwegian and English display.

- [x] Provide Bokmål/English labels, placeholders, actions, status/errors/confirmation copy and login/demo-preview controls.
- [x] Accessible selector and language attribute; browser-language default; preference survives reload/login navigation and unavailable browser storage.
- [x] Switching language preserves unsaved CV data, sharing, revisions, previews and session state. Never rewrite user-authored data.
- [x] Meaningful locale/error tests, integrated checks, desktop/mobile browser verification, independent affected-code review and current PR checks.

Status: CLOSED. Locally verified at reviewed source 46f6b92 with 166 tests, all typechecks, lint/build, desktop/mobile browser checks and independent review without material findings. Both GitHub workflows and automatic Vercel preview passed at 54484e1; see delivery.md for links. Language choice and the same saved draft persisted through reload/login navigation, and unsaved input, sharing and open preview survived language changes. PR stays unmerged. PDF document language and live Google/Supabase configuration remain outside this interface change.
