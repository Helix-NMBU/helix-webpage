# Current Member CV acceptance

Approved scope as of 25 October 2026. This supplements spec revision 11 with the user's later instructions. If they conflict, this document's explicit overrides apply.

## Required behavior

1. Real Helix Google Workspace authentication on `internal.helixnmbu.no`. `/login` is public; `/`, `/profile`, `/settings`, `/notifications` and team routes require a verified member. Keep the public website's homepage separate. Old member links preserve callback query parameters while redirecting internally. No marketing navigation on the internal host.
2. Server verifies Neon JWT and Google identity, verified Helix email and hosted domain. Self-service first login creates a private member account, never administrator access. Every CV operation binds to the authenticated member. A form loaded for A must never save, preview, publish, withdraw or delete with B's credentials. Check account ownership on tab focus and before sending requests.
3. Proper profile card with verified account email, editable name, phone, study and graduation year. The person's Helix job title comes from an administrator-owned database field. It is separate from Admin/Member access and CV headline. Show access role only in the sidebar account section.
4. Profile followed by CV on the same page. No Profile/CV tabs or About card. No CV uses a shadcn Empty and one Setup CV button. Existing CV row shows its title, icon-only Preview and an actions menu with Edit, Download and Delete. Download modal offers Norwegian by default or English. Deletion requires confirmation and preserves personal profile fields, clears CV content and withdraws publication atomically.
5. Setup/Edit opens a modal with clickable steps for Introduction, Education, Experience, Projects, Languages, Links, Review & sharing. Preserve authored data and legacy-compatible date/proficiency values. Helix roles belong to grouped Experience; projects remain separate. No skills editor or new skills output. Preserve legacy stored skills unless the member deletes the CV.
6. Private revision-checked autosave with visible saved/error feedback, failure preservation, conflict protection and unsaved-navigation guards. New unfinished setup is not a registered CV until Finish. Existing CVs stay accessible. Never silently overwrite concurrent changes or auto-publish private edits.
7. Platform interface is English only. CV output supports Norwegian Bokmål and English. Manual per-field translations, stable row keys, missing translation falls back to source text. Switching original language preserves both texts. No machine translation service or personal ChatGPT integration.
8. Readable generated PDF, Nordic characters, safe links, optional sections omitted and long-content pagination. Preview and download before publication. UI preview language selector and shared HTML/PDF content rules. Preview shows the contact data that consent permits. Use the already-approved CV design and Helix blue; no additional redesign or profile images.
9. Explicit publish, republish, withdraw. Published immutable snapshot and generated server PDF remain independent of later draft edits. Contact sharing applies to directory data and PDF. Green visibility toggle reflects published CV visibility. Turning on publishes, off withdraws. Retire old private files, authorize current published downloads and use short-lived storage URLs.
10. shadcn components first, sidebar-07, Geist platform font, Helix blue light theme, white primary accent dark theme. Profile and Settings accessible via account menu; appearance is a select there. Accessible desktop/mobile controls. Icons only for useful navigation/status or icon-only controls. No demo/local-preview/preview banners in the product.
11. Session notifications in browser memory, maximum 50, cleared on refresh/sign-out/account change. Top-right feedback, sidebar Notifications, selection/select-all/mark-as-read removes selected entries. No paid external notification service.

## Explicitly deferred

Sponsor Talent Directory browsing/entitlements, collaboration requests, pilot role matrix, AI assistant connections, Knowledge DB, budget integration and profile images. Existing team and AI pages are navigation representations requested by the user; they must not claim working integrations. They are not acceptance dependencies for Member CV.

## Linear evidence required

- [HELIX-8](https://linear.app/helixnmbu/issue/HELIX-8): automated account-switch regression plus a real browser reproduction with two Helix accounts. Keep open until both are recorded. User will have a teammate review the PR; a review alone is not proof of the two-account scenario.
- [HELIX-9](https://linear.app/helixnmbu/issue/HELIX-9): exact tested commit/URL, authorized OAuth callback/reload/focus, logout, expiry, rejected non-Helix identity and unavailable-session-service recovery. Separate real browser observations from local injected failures and server tests.
- [HELIX-23](https://linear.app/helixnmbu/issue/HELIX-23): desktop/mobile browser evidence for profile editing, CV generation and publication controls; component choice record. Review existing functionality rather than rebuild it.
- [HELIX-10](https://linear.app/helixnmbu/issue/HELIX-10): complete current PR diff review and CI, save/PDF/publish/republish/withdraw evidence, migration/config prerequisites, reconcile older GitHub #51/#57 after acceptance. **Must remain open until the accepted PR merges.** This delivery leaves the PR unmerged for human review.

Historical instructions in spec revision 11 about a bilingual platform, public-site fonts, floating/collapsible full-page editor, visible development labels and old member URLs are superseded by requirements 1, 4, 5, 7 and 10 above. The underlying authentication, data integrity, privacy, publication and PDF requirements continue to apply.
