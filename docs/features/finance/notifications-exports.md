# Finance notifications, exports, and recovery

Finance business events trigger notification delivery when configured. Authorized members can also run delivery, purchase exports, and upload cleanup from Finance tools. They reuse the existing server mail switches and the private finance bucket. There is no Gmail mailbox connection, no standing schedule, and no extra hosting service. `api/finance.ts` remains the only finance function.

Migration `db/migrations/017_finance_notifications_exports.sql` adds delivery attempts, export object metadata, and upload commit state. It does not change earlier migrations. Dispatch, export, download, and cleanup do not bump `finance.view_versions`, because they do not change a budget, purchase, request, or financing view.

## Configuration

Notification mail uses the same server switches as website mail:

- `HELIX_ENVIRONMENT`
- `WEBSITE_EMAIL_ENABLED`
- `WEBSITE_EMAIL_TEST_RECIPIENTS`
- `RESEND_API_KEY`
- `CONTACT_FROM_EMAIL`

Leave `WEBSITE_EMAIL_ENABLED` false unless a real send is intended. Outside production, a message is sent only when delivery is enabled, a key is present, and the recipient is on `WEBSITE_EMAIL_TEST_RECIPIENTS`. A missing switch does not permit a send. Production still requires the enabled switch.

Do not point finance mail at the Gmail OAuth client. Do not put a signed file URL or a refund account or phone number in a message, an export, or a log line.

Private files and large exports use `NEON_FINANCE_BUCKET` with the existing storage credentials. Export objects use keys under `exports/{member}/{export}/{token}`. A download mints a new short-lived URL only after a fresh purchase-register check. The signed URL is not stored.

## Delivery

The outbox row is the business record. Claiming a pending or failed row sets it to `uncertain` and writes a delivery attempt in the same database function, before any provider call. A process that stops after the claim cannot roll that claim back and cannot send the same attempt twice.

Statuses are `pending`, `sent`, `failed`, and `uncertain`.

- A known local failure before the provider is called is `failed`. `delivery_disabled` and `recipient_not_allowlisted` do not use one of the five attempts, so a later dispatch can still deliver that row after mail is enabled or the recipient is allowlisted. `recipient_inactive`, `recipient_email_missing`, and `compose_failed` do use an attempt.
- A provider error or an unknown result is `uncertain`.
- `uncertain` is not claimed again. Reconcile it as `sent`, `not_sent`, or `still_unknown`. Reconcile is refused while the latest attempt is still `claimed` and less than five minutes old, so it cannot overwrite a send that is still in progress. After five minutes, or after that attempt has been recorded, reconcile proceeds. `sent` stays sent and is not sent again. `not_sent` becomes `failed` and a later explicit delivery may claim it. `still_unknown` stays `uncertain`.
- Each row allows at most 5 attempts that reached the provider or failed for a recipient or composition reason. A disabled mail switch or a recipient outside the local allowlist does not consume an attempt. A delivery batch claims at most 25 rows. Automatic event dispatch processes bounded batches, and Finance tools can retry eligible rows.

Business mutations dispatch their notification event after saving. An interrupted dispatch can leave rows pending; Finance tools in the purchase register provide recovery. The head of finance receives a submitted request. The requester receives a decision. Active finance and head profiles receive a registration. Business does not. Registration text includes the reference, lines, amounts, current budget status, approval warnings, and a sign-in path. It does not include a file link.

`scripts/finance-recovery.mjs` only prints this bound and the reconcile-before-retry rule. It does not open a database connection. Apply delivery, cleanup, and reconciliation from Finance tools while signed in with a finance or head profile.

## Export

Finance and head profiles can export the current season. The CSV is `purchases.csv`. Cells that a spreadsheet could treat as formulas are prefixed so they stay text. Columns cover purchases, lines, allocations, payment and void state, current budget status, and document id, name, content hash, content type, and size. Refund numbers and storage URLs are omitted.

An export at or below 1 MiB is returned for the member to save. A larger export, up to 20 MiB, is written to the private bucket. The download action checks the purchase-register capability again and does not write an idempotency row, so a signed URL is not kept. Repeating the same export request id returns the saved result. A new request id builds the file again from current rows.

The public budget read does not list documents or export objects.

## Upload cleanup

A durable candidate ledger records final-object attempts so Finance tools can reconcile and clean up interrupted uploads. Cleanup deletes only an expired upload that the member owns, that is not linked to a purchase, and whose storage key is not saved on a document.

- A pending upload with no final key can be removed after `expires_at`.
- A finalized upload waits until 24 hours after `expires_at`.
- An abandoned upload whose object is not yet removed can be retried.
- The row is marked abandoned before the object delete, so a registration cannot attach it during cleanup.
- An unknown commit is recorded explicitly and blocks deletion until it is reconciled as `saved`, `absent`, or `still_unknown`.
- An unknown object delete leaves the commit uncertain. Reconcile it before another delete.

## Backup, export, and restore

Take a database backup of the `finance` schema and a copy of the private finance bucket. The purchase CSV is the member-facing export. Document rows keep the storage key and content hash; export rows keep the private object key and content hash. Restore the schema and the matching objects together. Do not restore a signed URL, and do not copy refund numbers into mail, exports, or logs.

After a restore, leave `uncertain` deliveries and uploads until someone records what the provider or bucket actually did. Then run delivery only for `pending` and `failed` rows. Do not send those rows from this repository's tests or from the recovery script.

## Lock order

`save_recovery_mutation` takes `pg_advisory_xact_lock(hashtextextended(actor::text || ':' || request_id::text, 0))`, then locks `finance.idempotency_keys` for update. It does not lock a budget or system row. `claim_outbox_deliveries` locks outbox rows with `for update skip locked` in `created_at`, `id` order. Result recording and reconciliation lock the outbox row, then the attempt. Upload cleanup locks the upload row, then reads documents. A document insert locks the matching upload row. A reused recovery request id with a different payload returns: `This request ID was already used for a different change.`

## Provider verification

Tests inject the mail sender and the object store, including injected failures. They do not call a live mail provider or a live bucket. Checking a configured provider belongs on an isolated branch with allowlisted test recipients and a disposable bucket, not on this change.
