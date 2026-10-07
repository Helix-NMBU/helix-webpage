# T-09: collapsible sections and familiar profile inputs

Local follow-up, parent #51, PR #57, spec revision 6, F-12/F-13.

- [x] Every editor section individually collapses with accessible controls, preserving unsaved input and language state.
- [x] Overview opens destination before scrolling/focusing; collapsed sections still save/preview/publish correctly.
- [x] Familiar education/experience/project/date/proficiency inputs, no competence tags, optional fields remain optional.
- [x] Additive data survives validation, draft roundtrip, HTML preview and generated PDF; legacy free text remains editable.
- [x] Bilingual Helix/shadcn desktop/mobile checks, relevant tests, independent review and current remote gates.

Status: CLOSED after verified remote 40e567b. Assigned from verified c0c9626; code reviewed at 5822203, 222 tests and bilingual desktop/mobile/PDF checks passed. See delivery.md. Both GitHub workflows and the automatic preview passed; existing PR #57 remains open and unmerged.
