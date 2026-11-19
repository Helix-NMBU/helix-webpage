# Project budget foundation contract

Implementation slice: PBA-01 / HELIX-76. Approved specification revision 1 remains authoritative. This document describes migration 066 and shared interfaces for dependent implementation, not an additional product decision.

## Allocation identities and versions

- `finance.project_budgets` is a project/season header. It stores `responsible_department_id`, `approved_version_id`, `pending_version_id` and `revision`. `expectedRevision` in mutations means this header revision. Project and responsible department must belong to the same finance season, and the department must be one of the project's departments.
- `finance.project_budget_versions` stores `version_number`, `status`, `revision`, submission/department/Finance actors and timestamps, and `submitted_snapshot`. User-facing stage names come from `PROJECT_BUDGET_STAGE_LABELS` in `src/features/Finance/project-budget-types.ts`.
- `finance.project_budget_entries.id` is the stable allocation identity. `budget_item_id` is null until a draft-only entry is approved/materialized. On first approval, insert its `finance.budget_items` allocation anchor with the SAME ID, then populate `budget_item_id`. Mapped historical entries keep their old ID and public reference. The old seasonal budget row remains an internal compatibility allocation container; it does not invent a project approval.
- `finance.project_budget_version_entries` is a complete candidate snapshot keyed by `(version_id,entry_id)`. It stores independent `ordinary_priority` P1-P4, planned integer ore and restricted `earmark_id`. Submitted entries cannot be edited. An approved version cannot be changed. Decision records carry immutable snapshots and cannot be updated/deleted. Return/resubmit must retain previous decision snapshots rather than overwrite their reviewed contents.
- A materialized legacy `budget_items` anchor still has the old constraint `priority='EM'` exactly when `earmark_id` is non-null. Materialization with restricted funding must therefore use anchor priority EM. The approved version keeps ordinary P1-P4 separately. Do not write ordinary P1 plus a non-null earmark into the legacy anchor, and never infer P0 from EM.

`finance.effective_budget_entries` is the canonical read projection. It carries the legacy item shape plus `season_id`, `project_budget_id`, `project_id`, `responsible_department_id`, `approved_version_id`, `ordinary_priority`, derived `priority`, `source`, `legacy_budget_status` and `complete`. It emits exactly one row per materialized allocation identity. A pending candidate does not change its legacy effective plan. Once a project version is approved, that snapshot supersedes its legacy amount; removed/omitted entries remain zero-plan cancelled history rows so actuals and documents stay traceable. Draft-only new entries are absent until materialized. Approved P0 is derived from an awarded, unreleased obligation independently of restricted funding. Legacy-only/unbudgeted anchors remain present.

Use this projection in later purchase/overview/scenario reads. Existing consumers are deliberately unchanged in this foundation slice so their old working behavior is not partially switched.

## Scoped authority

`api/_lib/finance-project-budget-foundation.ts` exports:

- `loadProjectBudgetScope(db, identity, projectId, responsibleDepartmentId = null)`.
- `listProjectBudgetScopes(db, identity)`.
- `previewProjectBudgetMapping(db, identity, seasonCode, manifest)`.
- `projectBudgetError(error)` for safe existing Finance errors.

The SQL scope revalidates the actor against canonical identity, verified active Neon user and the linked Google account. It uses current assigned project leads and responsible department leads. Financials controls existing Finance data; the explicit Head of Finance grant controls final approval and obligations. Platform-administrator titles/wildcards and partner sessions do not grant these capabilities. A supplied department cannot substitute for the existing header's authoritative department.

System validation reuses `project_management.canonical_department(identity.departments.name)`, including legacy `Electrical` to workspace `Electronics`; do not compare raw names or invent a second department directory. Closed seasons expose read-only capability state.

Shared wire types are in `src/features/Finance/project-budget-types.ts`. Actions are create/save/remove/submit/department-approve/Finance-approve/return/withdraw/request-changes/completion. Every existing-budget write carries `requestId`, `projectBudgetId` and header `expectedRevision`. Root service/router integration belongs to the coordinator and following slices. This foundation adds no top-level API route and does not widen `finance-service.ts`'s existing Financials gate.

## Mapping and existing data

The preview reads one SQL snapshot and performs no writes. It is Finance-only. It validates source IDs, same-season projects/departments, canonical system membership, duplicate assignments and existing project ownership. Legacy EM needs an explicit ordinary P1-P4 mapping priority. Source/mapped/unmapped migration totals concern remaining legacy plans; entries already superseded by an approved project version cannot inflate the next report's unmapped total. Existing approved mapping IDs remain available for an `already_mapped` conflict.

The baseline test bootstrap includes tracked migration 065 and null-requester imported purchases with historical payment metadata. It applies the actual feature migrations 066-073 present in the checkout, not the old finance concurrency test's 011-029 filter. New slices should extend this fixture where their concrete additional tables require it and keep real PostgreSQL cases in the Finance PostgreSQL workflow.

## Evidence and obligations

`finance.funding_applications` classifies a real pipeline `deal_id`, season, purchase conditions and explicit award actor/date/reference; `budget_obligations` links it to stable entries and records releases. PBA-07 owns authority, mutation paths and user-facing workflows. The foundation's derived priority uses awarded applications and unreleased links only.

`finance.purchase_lines` has nullable `project_budget_id` and `approved_version_id` for historical compatibility. PBA-05 records the actual approved version used. `finance.project_budget_completion` stores the independent completion marker and actor/reason/revision; changes must also append decision/audit evidence in the owning slice.

`finance.documents` retains non-null private `storage_key` for backward compatibility and adds a provider discriminator plus Drive reference fields. `finance.invoice_transfers` tracks fixed drive/folder, one persisted generated file ID, digest, lease/revision, resumable session, attempts and verified result. Its `staging_key` must point to the verified immutable final snapshot from current upload finalization, not the still-presigned-writable source staging object. Keep that snapshot while transfer is pending. PBA-06 owns actual transfer/recovery and credential handling; no live Drive setup or writes occurred here.

## Verification

PGlite and real PostgreSQL tests exercise the actual migration, verified role scopes, revocation/linkage denial, authoritative responsible department, Electrical/Electronics mapping, legacy IDs/documents/requests/imported payment preservation, pending versus approved effective plan, migration report conflicts/totals and independent-connection uniqueness. Loopback fixtures for the four workflow roles are gated by both dedicated development mode and local sign-in. Production never receives fixture accounts or grants.
