# Sponsor collaboration requests

Confirmed product scope: 25 October 2026. Implementation contract reviewed by the delivery coordinator for HELIX-17. Runtime delivery belongs to HELIX-18.

## Request types and fields

| Stored type | Label | Example |
| --- | --- | --- |
| `general_collaboration` | General collaboration | A sponsor asks Helix to discuss a joint technical activity. |
| `thesis_project` | Thesis/project proposal | A sponsor proposes a thesis topic for Helix to review. |
| `recruitment` | Recruitment enquiry | A sponsor asks Helix about recruitment cooperation. |

The form requires a type, a single-line title of 1 to 160 characters and a message of 1 to 10,000 characters. Validation trims surrounding whitespace and normalizes line endings. Replies also require 1 to 10,000 characters. Lengths use JavaScript string length. The MVP has no attachments or target-date field. A sponsor can explain timing in the message.

The server chooses the organization and author from the authorized session, creates the request as Submitted, and records creation time and revision. Client-supplied organization, author, status or administrator fields are rejected on creation. Every later mutation requires the saved revision. A stale revision returns HTTP 409 without changing the request or adding history.

## Access and ownership

Active sponsor contacts with portal access can create requests and read their organization's requests and shared replies. They cannot read another organization's request by guessing an ID. Current agreement and contact checks apply to every request, reply and mutation, including direct API calls.

Authorized Helix administrators can read the request queue. A new request can start unassigned. An authorized administrator claims it or assigns it to another active authorized administrator. The request must have an active assigned administrator before an administrator replies or changes its status. Sponsor contacts cannot assign requests. Reassignment is recorded in shared history.

The assigned administrator owns follow-up. Other authorized administrators may reassign a request before replying or changing status. A developer account does not receive administrator powers unless it has an explicit administrator grant.

The portal has shared replies and shared history only. There are no private administrator notes. Authors and timestamps appear with replies. The initial message and replies are immutable. There is no reply-edit or reply-delete flow in this MVP.

## Status transitions

| Current status | Administrator can choose | Sponsor can choose |
| --- | --- | --- |
| Submitted | Under review, Input needed, Declined | Cancelled |
| Under review | Input needed, Completed, Declined | Cancelled |
| Input needed | Under review, Completed, Declined | Cancelled |
| Completed, Declined, Cancelled | No transition | No transition |

Stored status values are `submitted`, `under_review`, `input_needed`, `completed`, `declined` and `cancelled`. There is no separate draft request state. Repeated transitions to the current status are rejected.

Both actors can reply to an open request. A sponsor reply while Input needed changes the status to Under review in the same atomic mutation. Other replies preserve the status. Completed, Declined and Cancelled requests are read-only, including assignment and replies. A sponsor creates a new request when a closed conversation needs to continue.

Each successful creation, assignment, status change and reply appends shared history with actor and timestamp. History changes and revision increments commit atomically with the mutation. A failed mutation leaves both unchanged. The server rechecks authorization, assignment and revision inside the mutation, so simultaneous replies, cancellation and reassignment cannot overwrite each other.

## Notifications and scope

Sponsors follow progress and exchange replies in the portal. The request flow sends no email notifications in the MVP. The invitation-only one-time login email is a separate authentication function and remains required.

A Thesis/project proposal is a request to Helix. It does not publish an opportunity or create a member application flow. Opportunity boards, member responses, booking, billing and proposal credits remain outside the MVP.

## Verification

The shared contract tests validate allowed fields, input bounds, stale revisions, every actor/status combination, sponsor replies to Input needed and terminal-state behavior. Runtime acceptance must also test real SQL atomicity, administrator assignment, organization isolation, expired/revoked access, direct endpoints and the browser flow. Contract tests alone do not establish runtime completion.
