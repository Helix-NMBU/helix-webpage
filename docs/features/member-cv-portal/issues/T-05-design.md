# T-05: website design follow-up

Local follow-up ticket. Parent #51 and existing PR #57. Spec revision 2, F-06/F-08. User explicitly requested the website design system.

- [x] Use website typography, Helix blue, actual logo and shared form components/theme variables.
- [x] Preserve semantic labels, submit/action button types, busy/disabled states and all CV workflow behavior.
- [x] Verify desktop/mobile, focus, private save, preview and dependent login theme in the browser.
- [ ] Run relevant checks, independently review affected code and verify current checks on existing PR #57. Leave unmerged.

Status: verified locally, awaiting current remote checks on existing PR #57. Worker 0b303e1 and logo fix a0f5ae7 integrated as 6c06c85 and d0133a3. All 103 tests, typecheck, lint/build and diff checks passed. Independent review at d0133a3 has no material findings. Browser verification covered 1280px desktop, 390px mobile, saved Nordic input, contact-redacted preview, publication/withdrawal, keyboard focus and the dependent login theme. Before/after screenshots and detailed evidence are in delivery.md. Parent #51 remains open and PR #57 stays unmerged.
