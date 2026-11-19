import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre, osloToday, parseNokToOre } from "./finance-money.js";
import {
  loadProjectBudgetScope,
  projectBudgetError,
} from "./finance-project-budget-foundation.js";
import {
  hashFinancePayload,
  mapPurchaseError,
  performPurchaseMutation,
} from "./finance-purchases.js";
import type { FinanceObjectStorage } from "./finance-storage.js";
import type { FinanceCapabilitySet } from "./finance-types.js";
import type { ProjectPurchaseContext } from "../../src/features/Finance/project-purchase-types.js";
import type { ProjectBudgetMutationResult } from "../../src/features/Finance/project-budget-types.js";
import {
  normalizePurchaseInput,
  validatePurchaseRelationships,
} from "../../src/features/Finance/purchase-domain.js";

const ACTIONS: Record<string, string> = {
  checkProjectPurchase: "checkPurchase",
  authorizeProjectPurchaseUpload: "authorizeUpload",
  finalizeProjectPurchaseUpload: "finalizeUpload",
  registerProjectPurchase: "registerPurchase",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(value: unknown, label: string): string {
  if (typeof value !== "string" || !UUID.test(value))
    throw new FinanceError(400, `Choose a valid ${label}.`);
  return value;
}
function purchaseError(error: unknown): FinanceError {
  if (error instanceof FinanceError) return error;
  if (error instanceof Error && error.message.startsWith("FINANCE|"))
    return mapPurchaseError(error);
  return projectBudgetError(error);
}
export function isProjectPurchaseMutation(action: unknown): boolean {
  return typeof action === "string" && Object.hasOwn(ACTIONS, action);
}

/** A scoped read: project leads can inspect the plan, but registration still needs the registering capability. */
export async function loadProjectPurchaseContext(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  projectId: string,
  responsibleDepartmentId?: string,
): Promise<ProjectPurchaseContext> {
  uuid(projectId, "project");
  const scope = await loadProjectBudgetScope(
    db,
    identity,
    projectId,
    responsibleDepartmentId
      ? uuid(responsibleDepartmentId, "department")
      : null,
  );
  if (!scope.capabilities.canRegisterPurchase)
    throw new FinanceError(
      403,
      "Only the responsible department lead or Finance can register project purchases.",
    );
  try {
    const row = (
      await db.query<{
        systems: ProjectPurchaseContext["systems"];
        entries: Array<{
          entry_id: string;
          id: string;
          approved_version_id: string | null;
          system_id: string;
          description: string;
          public_ref: string;
          planned_ore: string;
          actual_ore: string;
        }>;
        view_version: string;
      }>(
        `with authorized as materialized (select finance.project_budget_scope($1::uuid,$2,$3,$4::uuid,$5::uuid) as scope)
      select coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'name',sys.name,'code',sys.code) order by sys.code)
        from finance.systems sys join identity.departments dep on dep.department_key=sys.department_key
        join project_management.projects p on p.id=$4::uuid
        where sys.active and project_management.canonical_department(dep.name)=any(p.departments)),'[]'::jsonb) as systems,
      coalesce((select jsonb_agg(to_jsonb(item) order by item.public_ref) from (select pe.id as entry_id,e.id,e.approved_version_id,e.system_id,e.description,e.public_ref,e.planned_ore::text,
        finance.item_registered_actual_ore(e.id)::text as actual_ore from finance.effective_budget_entries e
        join finance.project_budget_entries pe on pe.budget_item_id=e.id
        where e.project_id=$4::uuid and (e.approved_version_id is not null or (e.source='legacy' and e.legacy_budget_status='approved')) and e.status<>'cancelled' and not e.protected) item),'[]'::jsonb) as entries,
      (select version::text from finance.view_versions where singleton) as view_version from authorized
      where (scope->'capabilities'->>'canRegisterPurchase')::boolean`,
        [
          identity.userId,
          identity.googleSub,
          identity.email,
          projectId,
          scope.responsibleDepartmentId,
        ],
      )
    ).rows[0];
    if (!row)
      throw new FinanceError(
        403,
        "Project purchase access is no longer available.",
      );
    return {
      scope,
      systems: row.systems,
      viewVersion: Number(row.view_version),
      entries: row.entries.map((e) => ({
        entryId: e.entry_id,
        budgetItemId: e.id,
        approvedVersionId: e.approved_version_id,
        systemId: e.system_id,
        description: e.description,
        publicRef: e.public_ref,
        plannedNok: formatOre(BigInt(e.planned_ore)),
        actualNok: formatOre(BigInt(e.actual_ore)),
      })),
    };
  } catch (error) {
    throw purchaseError(error);
  }
}

export async function mutateProjectPurchase(
  db: CvDatabase,
  storage: FinanceObjectStorage | null,
  identity: WorkspaceIdentity,
  body: Record<string, unknown>,
) {
  if (!isProjectPurchaseMutation(body.action))
    throw new FinanceError(400, "Unknown project purchase action.");
  const projectId = uuid(body.projectId, "project");
  const departmentId = uuid(
    body.responsibleDepartmentId,
    "responsible department",
  );
  const context = await loadProjectPurchaseContext(
    db,
    identity,
    projectId,
    departmentId,
  );
  // These are internal write-only flags. The dispatcher never exposes broad Finance reads.
  const capabilities = Object.fromEntries(
    [
      "publicBudgets",
      "publicEarmarks",
      "registerActual",
      "ownRequests",
      "financing",
      "manageFunding",
      "purchaseRegister",
      "filesAndRefunds",
      "paymentsVoidReview",
      "draftBudgetItems",
      "permittedImports",
      "createBudget",
      "approveBudget",
      "protectedBudgetEdits",
      "decideRequests",
    ].map((key) => [key, false]),
  ) as FinanceCapabilitySet;
  try {
    return await performPurchaseMutation(
      db,
      storage,
      {
        memberId: identity.userId,
        viewVersion: context.viewVersion,
        seasonCode: context.scope.seasonCode,
        capabilities,
      },
      { ...body, action: ACTIONS[String(body.action)] },
      {
        projectId,
        departmentId,
        googleSub: identity.googleSub,
        email: identity.email,
        async validate(input) {
          const normalized = normalizePurchaseInput(input);
          if (!normalized.purchase || normalized.errors.length)
            throw new FinanceError(
              400,
              normalized.errors[0]?.message ?? "Check the purchase.",
              normalized.errors,
            );
          const checked = await validatePurchaseRelationships(
            normalized.purchase,
            {
              today: osloToday(),
              choices: {
                systems: context.systems.map((s) => ({
                  id: s.id,
                  active: true,
                  unbudgetedItemId: null,
                })),
                items: context.entries.map((e) => ({
                  id: e.budgetItemId,
                  systemId: e.systemId,
                  status: "active",
                })),
              },
              async itemActualOre(id) {
                return (
                  parseNokToOre(
                    context.entries.find((e) => e.budgetItemId === id)
                      ?.actualNok ?? "0",
                  ) ?? 0n
                );
              },
              async itemPlannedOre(id) {
                return (
                  parseNokToOre(
                    context.entries.find((e) => e.budgetItemId === id)
                      ?.plannedNok ?? "0",
                  ) ?? 0n
                );
              },
            },
          );
          if (checked.errors.length)
            throw new FinanceError(
              400,
              checked.errors[0].message,
              checked.errors,
            );
          return { purchase: normalized.purchase, warnings: checked.warnings };
        },
      },
    );
  } catch (error) {
    throw purchaseError(error);
  }
}

export async function setProjectBudgetCompletion(
  db: CvDatabase,
  identity: WorkspaceIdentity,
  body: Record<string, unknown>,
): Promise<ProjectBudgetMutationResult> {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (
    !reason ||
    reason.length > 500 ||
    typeof body.complete !== "boolean" ||
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 0
  )
    throw new FinanceError(
      400,
      "Enter a reason and reload the current budget before changing completion.",
    );
  const normalized = {
    action: "setProjectBudgetCompletion",
    requestId: uuid(body.requestId, "request ID"),
    projectBudgetId: uuid(body.projectBudgetId, "project budget"),
    entryId: uuid(body.entryId, "entry"),
    expectedRevision: body.expectedRevision,
    complete: body.complete,
    reason,
  };
  try {
    const row = (
      await db.query<{ result: ProjectBudgetMutationResult }>(
        "select finance.set_project_budget_completion($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb) as result",
        [
          identity.userId,
          identity.googleSub,
          identity.email,
          normalized.requestId,
          hashFinancePayload(normalized),
          JSON.stringify(normalized),
        ],
      )
    ).rows[0];
    if (!row?.result)
      throw new FinanceError(
        503,
        "Could not change entry completion. Try again.",
      );
    return row.result;
  } catch (error) {
    throw purchaseError(error);
  }
}
