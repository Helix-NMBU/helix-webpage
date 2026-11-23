# Financing and agreement views

Financing starts with received, awaiting-payment and potential-funding totals for the season. Search and status filters affect the source list, while the totals continue to describe the season. Open a source to view its details, manage earmarks, edit it, or restore a deleted record. The funding editor shows the relevant payment date and keeps optional contact, agreement and reporting fields under Additional details. Existing validation, request identities, revision checks and shared notifications still handle saves.

An agreement opens on Deliverables. The header shows its sponsor tier, dates, contribution totals and contact. Contributions, Tasks and Changes have separate tabs. Each deliverable shows the status of its linked Marketing tasks and links only to tasks the viewer may open. Completion requires every linked task to be Done. Invoice tasks do not count toward delivery progress.

## S27 tier checklist

The package definitions in `src/features/PartnerDeals/tier-deliverables.ts` follow the S27 sponsor brochure's printed pages 15 and 16. They apply only when the agreement's primary season or an active contribution identifies S27. Other seasons keep their recorded commitments. Service agreements have negotiated deliverables because the brochure does not define a Service package.

Quantified benefits have separate commitments so both internal distributions, Instagram stories and campus distributions can be tracked individually. The media package is represented by its constituent posts rather than an additional duplicate commitment.

A package benefit without a corresponding agreement deliverable appears as Not recorded. It does not imply completed work or a linked task. Existing matching titles ignore case and repeated whitespace. Differently named negotiated commitments remain separate; review and amend their titles or add the relevant package commitments explicitly. Retired commitments remain in history and are not suggested again.

The deal editor offers Add tier checklist for missing commitments. Saving follows the existing deal workflow. For a won agreement, use Manage deliverables, Propose amendment, then Add missing tier deliverables. The existing amendment review and reconciliation process applies the new commitments and creates linked tasks. Opening an agreement never changes its terms, creates tasks, grants sponsor portal access, or grants CV access. Access-related checklist entries record delivery work; actual permissions retain their existing authorization paths.

## Validation

Targeted tests cover funding edits, failed saves, revision conflicts, refresh preservation, source filtering, task-link permissions, progress, retired terms, package quantities and the amendment payload for missing package benefits.

Browser checks on the loopback member development server covered adding the Silver checklist to a fictional deal, the approved local Won handoff, the resulting eight linked tasks, agreement tabs with pointer and keyboard, and the funding editor's optional fields, Escape dismissal and focus restoration. The financing account started without funding records, so the populated funding table and save paths are covered by automated component tests. These checks do not verify a production Neon transaction.

Release validation uses a clean checkout of current main and its locked dependencies. Frontend and API runtime typechecks, targeted tests, and the production build pass. The deployment-function guard stays at 11 functions. This change adds no API endpoints or database migrations. Grant opportunities retain their existing workflow and do not receive sponsor package commitments.
