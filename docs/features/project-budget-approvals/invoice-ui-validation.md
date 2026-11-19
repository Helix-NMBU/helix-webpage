# Invoice evidence UI validation

The reusable `InvoiceEvidence` control is used by project budget entries, the purchase register and Finance recovery. It opens an invoice only after a fresh authorized API request. Confirmed Drive evidence opens the returned Drive viewer URL; retained private evidence keeps its existing download action. Pending, transferring and attention states do not expose a viewer or private-storage fallback. Retry is offered only with a current revision and `canRetry` capability.

Component checks cover read-only project budget evidence, purchase register provider compatibility, repeated-click protection, stable retry request IDs, stale revisions, recovery pagination, authorization denial and late responses after session changes. Feedback and recovery actions use the shared notifications. Invoice actions use native shared buttons, so keyboard activation and disabled state follow the existing button behavior.

The dedicated member-local adapter requires both loopback member-local mode and a signed-in local member. It rejects unknown invoice records and does not simulate confirmed Drive storage. Missing local file or Drive configuration is reported honestly. It does not change member permissions or production authorization.

Root performs browser verification against the integrated local application. This component-only handoff does not establish a live Shared Drive upload, Google viewer access or deployment configuration; those require the approved release checks and actual provider evidence.
