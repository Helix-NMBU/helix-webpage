# Recruitment position management and member roles

Status: approved for implementation by the user's request on 2026-10-26.
Scope: [scope.md](scope.md)
Base: `internal-member-platform-mvp` at `7c66312a2b6e4bf2786abba3c44974550d88e3c4`.

## Requirements

- R-01: Store roles, departments, role-to-feature grants, member role assignments, and recruitment postings in Neon.
- R-02: Assign members a home department and multiple platform roles. Only Platform administrators can manage these assignments. A member cannot grant access to themselves.
- R-03: Apply the approved role rules: Team Member gets their home department's team feature; Department Lead gets that team feature and Recruitment; Project Manager gets Recruitment; Platform administrator can manage access roles and feature grants. Project Manager and Deputy Project Manager positions and Board members receive Project Manager access. A member's effective features are the union of assigned roles.
- R-04: Enforce each feature grant on the server. Team features are restricted to the member's assigned department. Recruitment access permits full management of all postings.
- R-05: Let an authorized recruiter create, edit, permanently delete, and toggle visibility of postings, including `Open Application`, with all fields in the current position format.
- R-06: Return visible positions only from the public endpoint. Use it for `/apply` and the application form. Hidden entries are not selectable by applicants.
- R-07: Preserve submitted application snapshots, review/rejection behavior, and file handling.
- R-08: Assign `Platform administrator` to `henrik.engdal@helixnmbu.no` in the staging role data. Preserve existing active recruiters by mapping their Neon `website.recruiters` entries to the Project Manager feature access during migration.
- R-09: Use existing shadcn/ui patterns, English labels, and shared notifications. Keep form input after recoverable errors.
- R-10: Maintain staging-first delivery through a PR targeting `internal-member-platform-mvp`. Validate the merged flows on the stable staging deployment before any separate production promotion.

## Acceptance

- A Platform administrator sees the access management screen and can assign a member's department and multiple roles. An ordinary member cannot read or change another member's access assignments.
- Users see only their department team feature unless another assigned role grants more access.
- Department Lead, Project Manager, and Platform administrator roles receive Recruitment access according to R-03; the API rejects requests without the relevant feature grant even when a route is called directly.
- Authorized recruiters can create an unpublished entry, edit it, publish/unpublish it, and permanently delete it. Save failures retain the form values.
- `/apply` and the application form list only visible entries from Neon. An application submitted for a position still retains the saved title and ID if that posting is later deleted.
- The specified account has the Platform administrator assignment on staging.

## Exclusions

- Production database changes, production role grants, and production promotion.
- Arbitrary administrator-created roles or permissions.
- Changes to applicant review decisions, rejection email content, or CV storage.

## Verification

Run affected tests, lint, frontend and API typechecks, and build. Check feature gates and write permissions with distinct role fixtures. Apply the migration to an isolated Neon branch derived from staging, then validate the migration and account grant before applying it to staging. After merge and migration, verify recruiter creation/edit/visibility/deletion and public filtering on the stable staging deployment.
