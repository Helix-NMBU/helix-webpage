# Shared Drive invoice integration research

Date: 19 November 2026
Feature: `project-budget-approvals`
Status: factual input for Prepare, not implementation or configured-service verification.

The user chose in-platform invoice uploads with automatic storage in Helix's shared Google Drive. This note checks the official API capabilities needed for that workflow. No Google Cloud configuration, credentials, actual Drive/folder or live invoice was inspected or changed.

## Identity and least privilege

Google supports backend access through a service account acting as the application. Domain-wide delegation is a separate administrator-authorized option, not a prerequisite to every server-to-server API call. Use a dedicated finance identity rather than a member's Gmail connection. The proposed baseline is direct access to the intended invoice location, with no impersonation or automatic domain-wide delegation. This is an integration recommendation; the actual identity and Workspace restrictions remain operational inputs. [Google server-to-server authorization](https://developers.google.com/identity/protocols/oauth2/service-account).

A service account has no personal Drive storage quota and cannot own files. It must upload into a shared drive, or use OAuth on behalf of a human. Confirm that the destination really is a Workspace shared drive rather than a folder shared from someone's My Drive. Shared-drive content belongs to the organization. [Shared drives overview](https://developers.google.com/workspace/drive/api/guides/about-shareddrives).

Google recommends narrow scopes. `drive.file` permits creating files and working with files opened/shared with the application; broad `drive` access is restricted. Test whether the dedicated identity and `drive.file` can create and retrieve files in the operator-selected existing folder. The documents do not establish that merely configuring an arbitrary existing folder ID grants that scope access. Failure is a setup/design gate, not permission to silently request full Drive access. A separately consented organization-owned OAuth connection is a possible alternative, but has not been selected or configured. [Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

Contributor, API role `writer`, can create files within a shared drive. An upload-only workflow does not inherently require Manager access. Verify effective folder capability such as `canAddChildren` and actual create/get behavior; do not grant drive-wide management merely for convenience. [Drive roles and permissions](https://developers.google.com/workspace/drive/api/guides/ref-roles), [file capabilities](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

## Destination and visibility

Shared-drive file operations, including create/get/update/list, need `supportsAllDrives=true`. For reconciliation searches within the configured shared drive, use `corpora=drive`, its `driveId`, and `includeItemsFromAllDrives=true`, rather than searching every drive. [Implement shared drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives).

Create each invoice with the configured folder ID in `parents`. Files have one parent; omitting it can put a file in a default location. The destination must be server-controlled, not an arbitrary folder provided by the registering member. [Create and populate folders](https://developers.google.com/workspace/drive/api/guides/folder).

File access is affected by parent permissions. An invoice's storage location must already have the intended restricted audience; a narrower platform view cannot undo wider Drive visibility. Uploading must not call permission creation or enable public/domain-wide link sharing. Opening a Drive viewer link still uses the person's Google access. [Sharing and permission inheritance](https://developers.google.com/workspace/drive/api/guides/manage-sharing).

## Upload and retry facts

Google recommends resumable upload for files above 5 MB and interrupted transfers. It also works for smaller files. Persist its session URI, query received bytes after an interruption, and resume from the confirmed offset. A completed status returns 200/201, incomplete status 308, and an expired session 404; sessions expire after a week. For chunking, use multiples of 256 KiB except the last chunk. Keep the session URI server-side as transfer state. [Upload file data](https://developers.google.com/workspace/drive/api/guides/manage-uploads).

Generate a Drive file ID before uploading the PDF/image and persist it before external I/O. Google explicitly supports retrying file creation with that ID after an uncertain response; a successful earlier creation causes the repeat to return 409 rather than create another file. Verify the stored file instead of treating every 409 as success. This applies to binary invoices uploaded without conversion to Google Docs. [Upload retries with pre-generated IDs](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [files.generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds).

Use private `appProperties` for an internal evidence identifier as an additional reconciliation aid. They are searchable metadata, not a uniqueness constraint or replacement for the persisted file ID. Do not put invoice contents, account details or secrets in properties. [Custom file properties](https://developers.google.com/workspace/drive/api/guides/properties).

After transfer, request a narrow metadata response and verify file ID, parent, shared-drive ID, non-trashed state, MIME type and byte size. Binary files expose checksums, including SHA-256 when available. `webViewLink` opens a file in its relevant viewer; it is not proof that every platform member has Drive access. Store identifiers and the verified reference, not an access token in a URL. [File resource metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files). Binary download through the API uses `files.get` with `alt=media` and requires the caller's effective download permission. [Download and export files](https://developers.google.com/workspace/drive/api/guides/manage-downloads).

## Proposed Helix contract

The following is a planning inference from those capabilities and the inspected code, not an implemented or externally verified integration.

1. Retain the existing browser-to-private-staging flow and server verification. Current `api/_lib/finance-storage.ts` and `api/_lib/finance-purchases.ts` already check upload ownership, expected size, allowed content, a SHA-256 digest and an immutable final snapshot. Existing limits are 10 MiB per file and 1 to 15 supporting files, from `src/features/Finance/purchase-domain.ts`; these are Helix limits, not Google limits.
2. Commit the actual purchase and a durable evidence-transfer record together after the bytes are safely staged. Distinguish `pending`, `transferring`, `stored` and `needs_attention` evidence state from payment and expense state. A Drive outage must not suppress an incurred cost or falsely report successful invoice storage.
3. Reserve one generated Drive file ID per evidence record, persist its immutable digest and destination, and claim transfer work under a lease/revision check. Use resumable upload of those same verified bytes. Reconcile uncertain completion by file ID, metadata and content verification before retrying with that same ID.
4. Mark evidence stored only after confirmation. A lost HTTP response or worker retry must not duplicate a purchase, invoice or file. Keep staged bytes until confirmed transfer and an agreed cleanup period; never clean up evidence still needed by a pending or uncertain job.
5. Keep the current finance document ID as the stable application reference. Add a backend discriminator and Drive identifiers for new invoices. Historical private-storage documents retain their existing authorized access route. There is no automatic historical migration.
6. Authorize invoice references through the finance/project access model. A browser can open the restricted Drive link using its own Google account; a backend retrieval path, if included, must recheck platform permissions rather than treat the service identity's wider access as the viewer's permission.

The contract can fit behind existing finance operations and recovery entrypoints; it does not justify one function per file or a new top-level deployment function.

## Inputs and acceptance before release

- Supply the real shared-drive ID and approved folder ID, a dedicated service identity and its server-side credential setup. Confirm Workspace policy permits its access. Do not borrow Gmail refresh tokens.
- Verify the narrow scope against that existing destination before choosing any broader scope or alternate identity. This is not proven by the API documentation alone.
- With synthetic files in an authorized test location, verify ordinary upload, a 10 MiB file, multiple supporting files, access denial, revocation, an interrupted transfer, expired resumable session, uncertain successful create, repeat 409 reconciliation, concurrent retries, wrong destination and mismatched content.
- Verify the intended Finance readers can open the invoice and an unauthorized account cannot. Inherited Drive permissions are a release input, not something the application may silently widen.
- Verify old private invoices remain accessible and pending evidence does not disappear from Finance recovery. Actual registration, invoice transfer and payment must remain separate observable states.

The API supports the required mechanics. Availability of the organization's destination, identity, effective scope and reader permissions remains unverified. No live setup or approval is implied by this note.

## Implemented transfer and release gates (PBA-06)

New supporting files stay in owned Neon private storage during staging and finalization. Registration verifies their signatures, complete size and SHA-256 digest, then commits the actual purchase, allocations, documents and one durable transfer job per document in one transaction. Migration 071 does not backfill historical documents. Existing private documents continue through the authorized download path; new Drive evidence cannot fall back to a private download while its transfer is incomplete.

Configure these server-only variables:

- `FINANCE_GOOGLE_SERVICE_ACCOUNT_JSON`: a dedicated Google service-account JSON credential with `type=service_account`, `client_email` and PKCS#8 `private_key`. The adapter accepts the fixed Google OAuth token endpoint and does not accept an impersonated subject. Keep the credential out of client bundles, logs and fixtures.
- `FINANCE_INVOICE_SHARED_DRIVE_ID`: the approved shared drive ID.
- `FINANCE_INVOICE_FOLDER_ID`: the approved invoice folder within that drive. The service identity must have access to this folder and permission to add children. Intended invoice readers need their own Google access.

The adapter requests only `https://www.googleapis.com/auth/drive.file`, uses its dedicated service identity, and never calls a permissions API. No Gmail token or delegated user identity is used. Missing/invalid credentials or destination configuration produce durable `needs_attention`; the actual expense remains saved. The destination may remain unresolved until configuration exists. Once bound to a job, its drive and folder stay fixed across retries and later configuration changes.

After registration commits, the existing Finance POST entrypoint attempts pending jobs. It persists a generated file ID before starting any resumable upload, then persists session and acknowledged byte progress with a revision and expiring lease. Each provider request and source read is bounded, and the invocation yields remaining work as pending. Registration returns the saved outcome after its first bounded server dispatch. A single nonblocking client chain per verified member/purchase automatically invokes further bounded batches through the same entrypoint while the same session and project scope remain active. There is no arbitrary batch-count limit. Active leases/no progress and transient failures back off; scope changes, authority loss and component disposal cancel further calls and ignore late responses. Shared notifications and Finance view invalidation report terminal evidence state safely. No new route, cron or deployment function is added. If the client leaves before continuation completes, jobs and private source bytes remain durable; Finance Recovery can resume them. `needs_attention` jobs require an explicit authorized retry and are excluded from automatic retry loops. An explicit retry returns the stable document ID and stored owning purchase ID; if it yields pending work, the same session-bound controller resumes further bounded batches automatically. Metadata/status refresh does not cancel that document’s subscription, while actor/document changes do.

Interrupted, expired and uncertain requests reconcile the same file ID. A returned HTTP success or HTTP 409 alone is insufficient: confirmation checks file ID, shared drive, exact parent, MIME, byte size, document reference and digest. Where Drive omits its SHA-256 checksum, the adapter reads and hashes the bounded media response. Only confirmed evidence gets the canonical restricted Drive viewer link. App authorization is checked before returning a link; opening it still requires the viewer's Google permissions. Provider IDs, resumable URLs, storage keys and service credentials are not returned in app evidence/recovery DTOs or CSV exports. Current member/Google linkage and project/department or explicit Finance authority are rechecked for claims and every durable advancement. A lease interrupted by authority loss can expire for Finance recovery without claiming successful storage.

Pending or voided evidence remains referenced by its registered upload and document. Cleanup must retain these private final bytes. Evidence state is independent of actual cost, purchase voiding and payment state. CSV exports retain stable app document IDs and include backend, transfer state and confirmed viewer URL; legacy private evidence never receives a fabricated Drive URL.

### Authorized synthetic-file acceptance procedure

The implementation and fault tests use synthetic local data and mocked provider responses. No real Drive write, effective folder access or intended-reader access has been verified as part of this implementation. Before release, obtain explicit authorization for the following service writes and record their results:

1. Confirm the approved drive/folder, dedicated identity, narrow OAuth scope and inherited ACLs with the workspace owner. Grant only the folder/service access required by the approved setup. Do not enable domain-wide delegation or broad public/domain permissions.
2. In the locally validated application with real member authentication, register a synthetic purchase with two clearly identifiable synthetic PDF/image files. Confirm the actual and both durable jobs commit, each file lands once under the configured folder, and each job becomes stored only after verification.
3. Interrupt one resumable transfer, simulate a lost response and retry from Finance Recovery. Verify the same stored file ID is reconciled without duplicate purchase, allocation or invoice, and that a changed server configuration does not retarget an existing job.
4. Test intended Finance, department and project readers through the app link and through Google Drive. Test an unrelated member and an account without Google folder permission. App authorization and Google ACLs must both enforce the intended access. Do not grant broad sharing to make a failed reader check pass.
5. Remove configuration or deny provider access temporarily. Register an incurred purchase and confirm saved actuals plus honest attention state; restore the approved configuration and recover without another actual expense. Confirm historical private downloads and provider-aware exports still work, and that no tokens/session URLs appear in notifications, logs or exports.

The named release gates remain the real drive/folder, dedicated credential, effective `drive.file` behavior, inherited ACLs and intended-reader checks. Local mocks establish protocol and recovery behavior, not those live service facts.


## Production keyless authentication (2026-11-22)

The organization enforces `iam.disableServiceAccountKeyCreation`. Preserve this policy. The production uploader uses Vercel OIDC and Google Workload Identity Federation; it stores no private key or user refresh token. The account remains `helix-finance-invoices@helix-nmbu.iam.gserviceaccount.com`, without project roles or domain-wide delegation.

Configure production-only `FINANCE_GOOGLE_WIF_AUDIENCE` to `//iam.googleapis.com/projects/1024286200685/locations/global/workloadIdentityPools/helix-finance-invoices/providers/vercel-production` and `FINANCE_GOOGLE_SERVICE_ACCOUNT_EMAIL` to that account. Both settings are required; any partial WIF configuration or nonproduction environment disables the adapter without falling back to a key. `@vercel/oidc` reads the runtime identity lazily, including rotating-token support.

The provider trusts `https://oidc.vercel.com/helix-nmbu`, audience `https://vercel.com/helix-nmbu`, subject `owner:helix-nmbu:project:helix-webpage:environment:production`. Its condition also requires exact owner ID `team_gh9gxu7pEyUymhJJzihIiDPZ`, project ID `prj_ZJlpmtshfaXvXnu0qQmQ2SPcE574` and environment `production`. Only that principal receives `roles/iam.workloadIdentityUser` on the uploader account. Enable IAM, STS, IAM Service Account Credentials and Drive APIs.

STS returns an intermediate credential for IAM; the final IAM access token requests only `drive.file` for ten minutes, with no delegates. Tokens, provider bodies and credentials must never appear in logs. Authentication and each provider request are bounded by the transfer deadline.

Folder-only Contributor access was explicitly approved. Google calls this API role `writer`; it also permits sharing individual files. The uploader contains no sharing API. Access is limited to S27 / 3.2 Faktura; it is not shared-drive membership.

Explicit authorized storage verification can run `node scripts/verify-finance-drive.mjs --create-test-files` in the production deployment build identity. It uses the real adapter to create clearly labelled 1 KiB and 10 MiB test files, verify upload progress and stored hashes, and print only safe file identifiers. It does not create purchases or alter financial records. Move those labelled files to Trash with the authorized Drive account afterward. This command is never part of the ordinary build.

Sources: [Vercel GCP OIDC](https://vercel.com/docs/oidc/gcp), [runtime token reference](https://vercel.com/docs/oidc/reference), [Google federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation), [Drive roles](https://developers.google.com/workspace/drive/api/guides/ref-roles).
