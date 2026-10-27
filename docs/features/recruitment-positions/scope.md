# Recruitment position management

Status: draft
Updated: 2026-10-26
Feature: recruitment-positions
Repository: Helix-NMBU/helix-webpage

## Problem

Recruiters need to manage the positions shown on the public `/apply` page without editing a checked-in JSON file. They need to create, update, remove, and control the public visibility of each posting.

## Users and outcome

- Recruiters use the authenticated internal recruitment area to manage postings.
- Applicants see only postings that recruiters have made visible on the public site.
- Recruiters can keep a posting private while preparing it and make it public later.

## Existing behavior

- `src/features/Apply/ApplyPage.tsx` loads `/positions.json` and renders the open positions and the special `Open Application` card.
- `src/features/Apply/ApplicationFormPage.tsx` loads the same file for its position selector.
- `public/positions.json` contains `id`, `title`, `department`, `applyUrl`, `contact` (`name`, `email`, optional `linkedin`), `about`, `tasks`, and `achieve`.
- `src/features/Recruitment/RecruitmentPortal.tsx` is an authenticated recruiter area for reviewing applications. Its access check uses Supabase `is_recruiter()`.
- New application rows keep `position_id` and `position_title`, so submitted applications have their own position label if a catalog item is later removed.
- The website currently has no dynamic position-management interface. The public page could not be fetched during scoping, so the current checked-in code and JSON are the source for its behavior.

## Confirmed behavior

1. Add a positions-management area in the internal recruitment tab.
2. Let an authorized recruiter create a posting, edit every field used by the public page, and permanently delete a posting.
3. Include the special `Open Application` entry in management and give it its own public-visibility control.
4. Give every posting an explicit public-visibility control. New postings default to hidden. A hidden posting remains available to recruiters and does not appear on `/apply` or in the public application form's position choices.
5. Show only visible postings on the public page and in the application form. Preserve the current department filters, open-position details, apply links, and application submission flow.
6. Use every field in the current JSON shape: title, department, application URL, contact name/email/optional LinkedIn, description, tasks, and outcomes.
7. Permanently remove deleted postings from the active catalog. Existing applications retain their saved position ID and title.
8. Store and serve posting data through Neon. Do not add Supabase for this feature. Recruiter writes require authenticated recruiter authorization. Public requests can read only visible postings.
9. Send success and failure feedback through shared app notifications. Keep form data available after a save failure so the recruiter can retry.

## Scenarios

- A recruiter creates a draft posting, saves it, and can find it in the internal list while applicants cannot see it.
- A recruiter edits a posting, saves it, and sees the updated content on the public page after publication.
- A recruiter turns off visibility for a posting. It disappears from `/apply` and cannot be selected by a new applicant.
- A recruiter removes a posting. Existing application records retain their stored title and ID.
- An unauthorized user cannot use the management interface or its write requests.
- When loading or saving fails, the recruiter receives a notification with a clear next step and can retry without losing unsaved input.

## Proposed implementation direction

Use Neon as the source of truth. The internal editor and public site should use server endpoints backed by Neon. The public endpoint returns visible postings only. The editor uses Neon Auth and permissions checked on the server. Replace the static JSON dependency for the public listing and application form. Do not expose database credentials in the browser.

The organization has six departments: Finance, Mechanical & Production, Electrical, Software & Autonomous, Business & Marketing, and Logistics. Department leadership positions are Head of Finance, Head of Mechanical & Production, Head of Electrical, Head of Software & Autonomous, Head of Business, Head of Marketing, and Head of Logistics. Head of Business and Head of Marketing both belong to Business & Marketing. Project Manager and Deputy Project Manager are cross-department leadership positions. Department leadership and both project-management positions make up Management. Some, but not necessarily all, Board members need recruitment access.

The current recruiter gate uses Supabase Auth and an active-member roster with a separate `has_recruitment_access` flag. The member platform uses Neon Auth and currently reports a single `Admin` or `Member` account role. That role does not describe a member's Helix responsibilities or provide recruitment permissions.

Recommended model: keep a controlled catalog of departments and organizational positions, and let administrators assign each member a home department and one or more positions. Derive Management membership from the assigned leadership positions instead of maintaining a second, duplicate Management assignment. Keep Board membership as an organizational assignment. Do not let members choose or grant themselves positions.

Use one access permission per internal feature, and map roles to the features they can use. Members may hold multiple roles; their feature access is the union of their roles' grants. The confirmed platform access role names are `Project Manager`, `Department Lead`, `Team Member`, and `Platform administrator`. Assign the Project Manager and Deputy Project Manager organizational positions, as well as Board members, the shared `Project Manager` access role. A department member gets access to their department's team feature, while a Mechanical & Production member does not get access to the Business & Marketing team feature by default. `Department Lead` grants the lead their department's team feature and the Recruitment feature. `Project Manager` grants Recruitment access. Users with Recruitment feature access can manage all postings in that feature. Check feature access on the server for every request. Hiding a tab is only a user-interface choice, not the access check.

Recommended administration: provide an administrator-only member access screen. An administrator selects a member's department, assigns or removes positions, and grants or revokes the four access roles. Keep the initial role and position catalog controlled by the application rather than letting administrators invent arbitrary permission bundles. Add a new catalog entry when Helix adopts a new position or permission.

## Constraints and exclusions

- Keep user-facing interfaces in English and use the existing shadcn/ui components and theme.
- Do not change applicant review, rejection, or CV flows as part of this feature.
- Do not show development or preview labels in the product interface.
- Follow the staging-first delivery rule in `AGENTS.md`: target `internal-member-platform-mvp`, validate on its stable staging deployment, and promote to `main` only through a separate PR after staging validation.
- This scope does not authorize implementation, database changes, deployment, or publication.

## Open decisions

1. Confirm the role-to-feature grants: `Team Member` gets their department's team feature; `Department Lead` gets that feature and Recruitment; `Project Manager` gets Recruitment and is assigned to the Project Manager and Deputy Project Manager positions and to Board members; `Platform administrator` manages member roles and feature access. Access to Recruitment permits managing every posting. The four role names and Board-member assignment to Project Manager are confirmed; the full feature mapping remains proposed.

## Readiness

This scope remains `draft` until the role-to-feature mapping is confirmed. After that, Prepare can define the data contract, Neon permission model, migration, public read path, editor states, and staging verification. No production code has been changed.
