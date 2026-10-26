# Published Talent Directory

The sponsor directory joins visible `cv.directory_entries` to the exact `cv.publications` revision referenced by the entry. It does not read `cv.documents`, member identity details or a private draft. An entitled sponsor can browse every currently published profile. CV sharing is a separate choice; disabling it does not hide an otherwise published profile.

The server returns explicit public profile fields. Email and telephone properties are absent unless both the directory projection and the publication's sharing flags allow them. Draft translations, registration metadata and object-storage keys are absent from the response.

`directory` accepts a partial name search and exact normalized programme, graduation year, department and skill filters. Options come from all current published profiles. Departments come only from `experience.department` on structured Helix or Helix NMBU experience entries. Job titles and outside employers do not supply department values. Members missing optional fields remain visible in unfiltered browsing.

`profile` and `cv` accept a member ID, not a file path. CV viewing and downloading require the same active contact, current agreement, Talent Directory entitlement and matching current publication/file consent. Both use 120-second presigned URLs. The download disposition defaults to attachment, preserving the existing member-download behavior; viewing requests inline disposition. The handler rechecks publication and sponsor entitlement after signing before returning a grant. There is no shared authorization cache. Links already issued can remain usable until expiry, and downloaded copies cannot be recalled.

## Components checked

Before implementation, the official [Card](https://ui.shadcn.com/docs/components/card), [Input](https://ui.shadcn.com/docs/components/input), [Select](https://ui.shadcn.com/docs/components/select), [Button](https://ui.shadcn.com/docs/components/button), [Dialog](https://ui.shadcn.com/docs/components/dialog), [Alert](https://ui.shadcn.com/docs/components/alert), [Badge](https://ui.shadcn.com/docs/components/badge) and [Empty](https://ui.shadcn.com/docs/components/empty) documentation was checked. The panel reuses those existing repository components and Label.

Semantic sections and lists render the member's published education, experience and project data. The CV iframe renders an authorized PDF. These are domain content and document rendering, with no suitable drop-in shadcn component. No new generic component or styling dependency was added.

## Verification boundary

SQL-backed tests run the existing member-publication migration and the sponsor migration in isolated PGlite. They exercise draft/private-edit separation, actual publication/republishing/withdrawal, filter data, contact and CV sharing, current-file matching, anonymous and uninvited access, Bronze/Partner/Service, expiry/revocation, separate sponsor organizations and changes while signing. A storage regression checks the signed inline/attachment disposition and 120-second expiry without contacting storage. DOM tests cover access denial, shared/hidden actions, empty states, retry and stale-request cancellation.

This evidence does not establish a deployed sponsor hostname, real email delivery, live file download or production pilot acceptance. Record those checks in [pilot.md](pilot.md) on the accepted integrated release.
