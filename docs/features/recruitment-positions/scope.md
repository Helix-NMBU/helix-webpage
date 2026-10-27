# Recruitment position management and member roles

Status: ready-for-implementation
Updated: 2026-10-26
Feature: recruitment-positions
Repository: Helix-NMBU/helix-webpage

## Confirmed decisions

- Recruiters manage all entries shown on `/apply`, including `Open Application`.
- Each posting can be created, edited, permanently deleted, and shown or hidden on the public site.
- The editor includes the existing fields: title, department, apply URL, contact name/email/optional LinkedIn, description, tasks, and outcomes.
- New entries start hidden. Hidden entries do not appear on `/apply` or in the application form's position choices. Existing application records keep their saved position ID and title after a posting is deleted.
- Use Neon for storage, identity, and server-side feature authorization. Do not add Supabase for this feature.
- The controlled platform role names are `Project Manager`, `Department Lead`, `Team Member`, and `Platform administrator`. Members may have multiple roles.
- Assign `Project Manager` to the Project Manager and Deputy Project Manager positions and to Board members.
- `Team Member` grants access to the member's home-department team feature. `Department Lead` grants the same department feature plus Recruitment. `Project Manager` grants Recruitment. `Platform administrator` can manage member role assignments and feature access.
- One access grant controls each feature. Anyone with Recruitment access can manage every posting. Team features are department-specific.
- Assign `Platform administrator` to `henrik.engdal@helixnmbu.no`.
- Use shared app notifications for status and errors, preserving unsaved form content after a failed save.

## Existing code and technical context

- `src/features/Apply/ApplyPage.tsx` and `ApplicationFormPage.tsx` currently load `public/positions.json`.
- `api/_lib/website-service.ts` already uses Neon and Neon Auth for application handling, but reads positions from the JSON file and checks an older `website.recruiters` allowlist.
- `src/features/Recruitment/RecruitmentPortal.tsx` is mounted inside the authenticated member platform at `/recruiting`.
- Neon `identity.members` already contains the specified administrator account on the staging database.
- Current app user roles are a hard-coded `Admin` or `Member`; replace this access decision with the Neon role and feature-grant model. Keep organizational positions separate from platform roles.
- Existing member routes provide per-department team previews. Do not grant access to other departments' team features by default.

## Scope

Implement a Neon-backed role and feature-access model, member role assignment for Platform administrators, recruiter CRUD and visibility controls for positions, and a public Neon-backed positions endpoint used by both public listing and application form. Preserve applicant review, rejection, email, and CV behavior. Do not add arbitrary role creation or user self-assignment.

The existing position list will be seeded into Neon, including the current `Open Application` entry. Preserve applicant submission compatibility and stored application snapshots.

Follow `AGENTS.md`: target `internal-member-platform-mvp` through a PR, apply/test the staging schema and user grant on the staging database, validate the merged flow at the stable staging deployment, and leave production for a separate promotion PR.
