# T-07: shadcn/ui member interface

Local follow-up, parent #51, PR #57, spec revision 4, F-06/F-08/F-09/F-10. User requested shadcn/ui for suitable member page components, retaining Helix design/font/colors.

- [x] Reuse installed shadcn/ui form controls, labels, checkboxes, cards, alerts/statuses, buttons and language select.
- [x] Use shadcn/ui preview and unsaved-change dialogs with keyboard/focus support and localized labels.
- [x] Preserve draft, sharing, busy/session behavior, bilingual state, preview redaction and Helix theme including portal menus/dialogs.
- [ ] Integrated checks, browser desktop/mobile and meaningful keyboard/dialog/checkbox flows, independent review and current PR CI.

Status: integrated and locally verified at 2a92bae. 171 tests, all typechecks, lint/build, independent review and desktop/mobile bilingual keyboard/dialog/checkbox browser flows pass. Current remote PR gates pending; close after they pass. No backend API, PDF content or live configuration changes. PR remains unmerged.
