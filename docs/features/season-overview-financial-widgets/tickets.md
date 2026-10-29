# Season overview financial widgets ticket plan

Specification: [spec.md](spec.md), revision 1. The user confirmed the scope and requested publication in Linear on 29 October 2026. Tracker: Linear, Helix member Platform, Project management milestone. Parent: [HELIX-59](https://linear.app/helixnmbu/issue/HELIX-59/season-overview-financial-widgets). The parent is the specification, not a worker assignment.

| Ticket | Behavior | Direct blockers | Requirements |
| --- | --- | --- | --- |
| [SFW-01 / HELIX-60](https://linear.app/helixnmbu/issue/HELIX-60/sfw-01-provide-the-authorized-season-financial-summary) | Server-authorized season financial summary | None | F-01, F-02, F-05 |
| [SFW-02 / HELIX-61](https://linear.app/helixnmbu/issue/HELIX-61/sfw-02-maintain-a-dated-combined-bank-balance) | Finance-maintained dated bank snapshot | None | F-03, F-04, F-05 |
| [SFW-03 / HELIX-62](https://linear.app/helixnmbu/issue/HELIX-62/sfw-03-show-understandable-financial-widgets-on-season-overview) | Season Overview widgets and integrated verification | SFW-01, SFW-02 | F-01 through F-06 |

The native blocker relationships were read back after publication. The first two tickets are eligible independently, but coordinate edits to shared finance API dispatch, contracts, migrations and local adapters. The widget ticket consumes both read contracts. Local issue files preserve the planned acceptance and verification details; Linear is the tracker. No assignees, estimates, implementation branches, or deployment have been created.

The existing Finance milestone reports configured-service acceptance and production migrations/roles as unconfirmed. Verify those prerequisites before release; do not assume that its production data is ready.
