# Helix member platform

Status: ready-for-prepare at milestone level
Agreed: 2026-10-25
Feature: helix-member-platform
Repository: Helix-NMBU/helix-webpage
Linear project: https://linear.app/helixnmbu/project/helix-member-platform-d4f6b360b4c0

## Agreement and authorization

The user requested an interview followed by creation of a separate Linear project and its milestones. The discussion confirmed the boundaries below. This authorizes the planning changes and transfer of existing Member CV work. It does not authorize new application implementation.

Budgets and Knowledge DB are broad placeholders pending contributor input. They are not ready for implementation preparation.

Build Helix's internal member platform for running a Formula Student season. Initial users of the new operational modules are department leads and selected teams. The functions work inside the platform.

This is a separate delivery project from [Sponsor portal MVP](https://linear.app/helixnmbu/project/sponsor-portal-mvp-86670fe706a7). Member CV belongs here; sponsor-facing Talent Directory access and collaboration requests remain in Sponsor portal MVP.

## Confirmed scope

### Member CV
Continue the existing member profile and CV delivery at internal.helixnmbu.no. Members sign in with their Helix Google Workspace account, maintain structured CV fields, save private drafts, preview/download a generated CV, and explicitly publish, republish or withdraw their profile. Draft edits remain private until republished. Preserve member sharing choices and the existing CV access rules.

The original Member CV milestone and its existing issues HELIX-8, HELIX-9, HELIX-10 and HELIX-23 have moved here from Sponsor portal MVP, preserving their history, status and assignees. Reuse the current Neon delivery in [Helix-NMBU/helix-webpage#62](https://github.com/Helix-NMBU/helix-webpage/pull/62). Sponsor portal MVP consumes the published member data through its separately scoped integration.

### Member Gmail
Add a Gmail workspace inside the member portal so an authenticated member can work with their own Helix mailbox without leaving internal.helixnmbu.no. The first useful flow is an opt-in **Connect Gmail** action followed by a mail tab that lists the member's inbox, opens messages and threads, searches mail, displays attachments, composes messages and sends replies from the member's Gmail address.

Gmail access is a separate authorization from Google sign-in. Each member approves it through Google's OAuth consent screen. The server exchanges the one-time authorization code for short-lived access and refresh tokens, stores the refresh token encrypted and binds it to the same Helix user. The portal never receives or stores the member's Google password. Consent is requested again if the OAuth client or requested permissions change. Members can disconnect the integration and revoke access.

The portal should use Gmail as the source of truth. "Mirror mail" means a live mailbox view with only the cache needed for performance and synchronization. The first release does not create a permanent second copy of every message or attachment in Helix storage.

The initial permission set should be the least set that supports the agreed behavior: `gmail.readonly` for reading and searching, `gmail.send` for sending, and `gmail.modify` only where the product requires drafts, labels, read/unread state or moving messages to Trash. Do not request `https://mail.google.com/` or use domain-wide delegation for member mail. Gmail read and modify permissions are restricted scopes, so the implementation must account for Google OAuth review or an applicable internal-use exception and for Helix Workspace administrator approval.

The member sees a clear disconnected, consent-denied, revoked-token or temporarily unavailable state. A revoked or invalid token must stop Gmail requests and require a new connection. Mail data must remain scoped to the member who authorized it. Access through direct API calls must enforce the same user binding as the interface.

Shared mailboxes, delegated access to another person's mailbox, organization-wide search, administrator access, automatic forwarding and permanent deletion are outside this milestone. Whether the first release includes label editing, draft persistence, Trash actions and attachment upload remains a preparation detail; each addition must be mapped to the minimum Gmail scope and retention rule.

### S27 project management
S27 is the main season production project inside the platform. It contains subprojects related to departments; a subproject can involve several departments.

Leads create subprojects, add tasks, assign members, track task status and set task deadlines and milestones. Provide season, subproject and department progress views. The S27 overview makes urgent work visible through overdue and approaching deadlines, blocked tasks, and task/milestone status against deadlines.

The first version uses deadlines and recorded status. Effort estimates, member-capacity planning and predictive completion forecasts are deferred. This milestone builds the platform functionality; it does not create a separate S27 delivery project in Linear.

### S27 sponsors and delivery tasks
Provide an Attio-style overview of current S27 sponsors, using Attio as the initial source of sponsor data. Show company name, sponsor tier and contribution. Allow all authenticated platform users to view this sponsor information for now.

Each sponsor tier has a shared checklist of benefits Helix must deliver. Automatically create sponsor-linked delivery tasks from that tier checklist. Business & Marketing can assign and complete those tasks and see, per sponsor, what is owed, outstanding and delivered. Use the platform's task management so members can track the work alongside other responsibilities.

Confirm the actual tier-to-benefit mapping and Attio field mapping before implementation. Generation must preserve completed work and avoid duplicate obligations when data is refreshed. Exact handling of tier changes, exceptions, contribution representation and refresh failures remains implementation scoping work.

Historical seasons S24-S26, expanded sponsor metrics, full contact management, deal pipelines and a broader sales workflow are deferred. No two-way Attio writeback is agreed.

### Budgets
Reserve a broad milestone for a full financial overview broken down by department and other needed categories. Scope the details with Oskar and incorporate the material he already has after he joins Linear. Accounting integrations, approvals, data fields and financial workflows are not yet agreed.

### Knowledge DB
Reserve a broad milestone for members to search Helix's existing information and documentation. People are already working on this outside Linear. Bring them into scoping and reuse their work. Content sources, search behavior, architecture and delivery criteria remain open.

## Initial users and access
Department leads and selected teams are the initial users of the new operational modules. They can see projects and progress across departments. Sponsor information is visible to any authenticated platform user for now. Detailed roles, editing permissions and access design will be reviewed later. This decision does not make the platform public or change Member CV draft/publication privacy.

## Delivery milestones
1. Member CV
2. Member Gmail
3. S27 project management
4. S27 sponsors and delivery tasks
5. Budgets
6. Knowledge DB

These milestones represent agreed work areas, not a committed release sequence. Budgets and Knowledge DB are placeholders pending contributor scoping. Milestone dates, new owners and a platform target date are unset.

## Planning status and open details
The user confirmed the Member Gmail milestone through the scope discussion on 25 October 2026. The scope is sufficient for milestone planning. Each area still needs implementation preparation, particularly Gmail's exact first-release actions, OAuth client configuration, Workspace administrator policy, token storage, retention, audit logging and failure handling. No new application implementation or integration setup is part of this planning change.

The repository is Helix-NMBU/helix-webpage. The existing Member CV design requirement remains: use suitable shadcn/ui components and preserve a clean, consistent interface. Existing CV implementation and issue history must be reused. Gmail implementation references are Google's [server-side Gmail authorization guide](https://developers.google.com/workspace/gmail/api/auth/web-server), [Gmail scope reference](https://developers.google.com/workspace/gmail/api/auth/scopes) and [Workspace app-access controls](https://knowledge.workspace.google.com/admin/apps/control-which-third-party-and-internal-apps-access-google-workspace-data).

## Repository context and evidence

The existing documentation layout is docs/features/<feature>/scope.md. The related Member CV scope is docs/features/member-cv-portal/scope.md. That document contains an older Supabase baseline; the live Linear project identifies the current Neon delivery in PR #62 as the integration baseline. Recheck the actual branch and implementation when preparing work.

The canonical checkout already contained unrelated untracked docs/ when this file was added. Preserve those files. No branch was created or switched, and no application source was edited.

Live Linear was checked on 2026-10-25. Sponsor portal MVP initially owned Member CV and four associated issues. The original milestone, 7a9ba2b0-7e9b-48a1-8509-8117c640a1af, and HELIX-8, HELIX-9, HELIX-10 and HELIX-23 now belong to the platform project. Issue identities, content, status and assignees were preserved. Sponsor-facing access, requests and integrated sponsor-pilot testing remain in Sponsor portal MVP; its description and HELIX-21 now reflect the cross-project dependency.

## Remaining preparation work

- Define task statuses, progress calculation and what counts as an approaching deadline. The user selected status/deadline flags rather than predictive forecasts.
- Define assignment, cross-department participation and editing behavior. The user deferred detailed roles/access review and explicitly allowed sponsor information to be visible to any platform user for now.
- Map current S27 Attio fields to company name, sponsor tier and contribution. Decide refresh behavior and failure reporting. Two-way Attio writes are not agreed.
- Confirm the actual tier benefit checklists. Define task-generation idempotency, tier changes, manual exceptions and contribution representation before implementation. Avoiding duplicate tasks and preserving completed work are implementation safeguards, not new user-confirmed workflows.
- Scope Budgets with Oskar and reuse his existing material. Do not assign him work or invite/message him as part of this planning task.
- Scope Knowledge DB with the existing contributors and inspect their work before choosing content sources or architecture.
- Decide whether the first Gmail release includes label editing, draft persistence, Trash actions, attachment upload and local caching. For each selected action, confirm the minimum OAuth scope, retention period and audit requirement.
- Confirm the Helix Workspace administrator who can approve the OAuth app and Gmail high-risk scopes. Verify whether the app can remain internal to `helixnmbu.no` or needs Google's verification process.
- Set dates, release sequence and new owners through team planning. Preserve existing Member CV issue owners.

