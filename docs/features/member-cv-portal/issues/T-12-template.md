# T-12: reference CV layout

Local follow-up, parent #51, PR #57, approved spec revision 9, F-16. User confirmed Helix roles stay in Experience and photos remain deferred.

- [x] Template typography, colors, introduction/education/two-column experience and separate projects in generated PDF and demo preview.
- [x] Optional reference text roundtrip, secondary bilingual control; no invented claim or sample details.
- [x] Existing content, privacy, grouping, dates, safe links and publication boundaries preserved.
- [x] Compact/long/empty PDF rendering, both-language desktop/mobile browser and relevant integrated checks pass.
- [x] Independent review and current-commit remote gates pass.

Status: CLOSED after current-commit gates passed at a012da3eed71d37e45918cd669c8f9700bbe34f7. 358 tests/23 files, three typechecks, lint/build/diff pass; both GitHub workflows and automatic preview succeed. Coordinator inspected all 14 integrated PDF pages and Norwegian/English desktop/mobile preview. All three independent reviews pass at final code 00b27e892aa99ff1f68f077cc9bc7608dfbfe8c5. See delivery.md for worker/integration/review/browser/PDF and remote evidence. Assigned from verified 0188602. Existing PR #57 stays unmerged; parent #51 remains open until merge. Live rollout prerequisites remain in setup.md.
