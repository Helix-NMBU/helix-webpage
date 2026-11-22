import { createHash } from "node:crypto";
import { parseBudgetCsv, parseImportAmount, normalizeImportDescription } from "../../src/features/Finance/budget-import.js";
import type { ProjectBudgetImportPreview, ProjectBudgetScope } from "../../src/features/Finance/project-budget-types.js";
import type { BudgetImportRow } from "./finance-types.js";
import type { CvDatabase, WorkspaceIdentity } from "./member-cv-service.js";
import { FinanceError } from "./finance-error.js";
import { formatOre } from "./finance-money.js";
import { projectBudgetError } from "./finance-project-budget-foundation.js";

type Entry = { entryId: string | null; systemId: string; description: string; category: string; plannedOre: string; ordinaryPriority: string; reuseStatus: string;
 expectedPurchaseDate: string | null; ownerMemberId: string | null; ownerEmail: string | null; status: string; note: string | null; earmarkId: string | null; removed?: boolean; actualOre?: string };
type System = { id: string; code: string; name: string; active: boolean };
type Part = { id: string; reference: string; status: string };
function values(entry: Entry): Record<string, string | null> {
  return { description: entry.description, system_id: entry.systemId, planned_nok: formatOre(BigInt(entry.plannedOre)), priority: entry.ordinaryPriority, category: entry.category,
    reuse_status: entry.reuseStatus, expected_purchase_date: entry.expectedPurchaseDate, owner_email: entry.ownerEmail, note: entry.note, earmark_id: entry.earmarkId, status: entry.status };
}
/** Preview reads one authorized SQL snapshot. Apply repeats it, then rechecks its token in the locked write. */
export async function prepareProjectBudgetImport(db: CvDatabase, identity: WorkspaceIdentity, body: { projectBudgetId: string; expectedRevision: number; csv: string }) {
  const parsed = parseBudgetCsv(body.csv);
  if (parsed.limitError) throw new FinanceError(413, parsed.limitError);
  try {
    const snapshot = (await db.query<{ revision: number; stage: string; scope: ProjectBudgetScope; token: string; version: string; systems: System[]; parts: Part[]; entries: Entry[] }>(
      `select h.revision,v.status as stage,finance.project_budget_scope($1::uuid,$2,$3,h.project_id,h.responsible_department_id) as scope,
       finance.project_budget_import_snapshot_token(h.id) as token,(select version::text from finance.view_versions where singleton) as version,
       coalesce((select jsonb_agg(jsonb_build_object('id',sys.id,'code',sys.code,'name',sys.name,'active',sys.active) order by sys.id) from finance.systems sys join identity.departments d on d.department_key=sys.department_key
         where project_management.canonical_department(d.name)=any(p.departments)),'[]'::jsonb) as systems,
       coalesce((select jsonb_agg(jsonb_build_object('id',fp.id,'reference',fp.public_ref,'status',fund.status) order by fp.id) from finance.funding_parts fp join finance.funding fund on fund.id=fp.funding_id where fund.season_id=h.season_id),'[]'::jsonb) as parts,
       coalesce((select jsonb_agg(jsonb_build_object('entryId',e.entry_id,'systemId',e.system_id,'description',e.description,'category',e.category,'plannedOre',e.planned_ore::text,'ordinaryPriority',e.ordinary_priority,
         'reuseStatus',e.reuse_status,'expectedPurchaseDate',e.expected_purchase_date,'ownerMemberId',e.owner_member_id,'ownerEmail',e.owner_email,'status',e.status,'note',e.note,'earmarkId',e.earmark_id,'removed',e.removed,
         'actualOre',(select coalesce(sum(a.amount_ore),0)::text from finance.allocations a join finance.purchase_lines pl on pl.id=a.line_id join finance.purchases purchase on purchase.id=pl.purchase_id and purchase.status='registered' where a.budget_item_id=e.entry_id)) order by e.entry_id)
         from finance.project_budget_version_entries e where e.version_id=v.id),'[]'::jsonb) as entries
       from finance.project_budgets h join project_management.projects p on p.id=h.project_id left join finance.project_budget_versions v on v.id=h.pending_version_id where h.id=$4::uuid`,
      [identity.userId, identity.googleSub, identity.email, body.projectBudgetId],
    )).rows[0];
    if (!snapshot) throw new FinanceError(404, "Choose a project budget.");
    if (!snapshot.scope.capabilities.canDraft) throw new FinanceError(403, "Only an assigned project lead can import entries.");
    if (snapshot.stage !== "draft" || snapshot.revision !== body.expectedRevision) throw new FinanceError(409, "The candidate changed. Reload its Draft and preview again.");
    const errors = [...parsed.errors], rows: BudgetImportRow[] = [], entries: Entry[] = [], matched = new Set<string>(), seen = new Set<string>();
    const counts = { added: 0, changed: 0, unchanged: 0, removed: 0 };
    const totals = new Map<string, bigint>();
    for (const record of parsed.rows) {
      const value = record.values, system = snapshot.systems.find(sys => sys.id === value.system_id || sys.code === value.system_id);
      if (!system?.active) { errors.push({ field: "system_id", line: record.line, message: `Line ${record.line}: choose an active system belonging to this project.` }); continue; }
      const key = `${system.id}\0${normalizeImportDescription(value.description ?? "")}`;
      if (seen.has(key)) { errors.push({ field: "description", line: record.line, message: `Line ${record.line}: this system and description occur more than once.` }); continue; }
      seen.add(key);
      const matches = snapshot.entries.filter(entry => entry.systemId === system.id && normalizeImportDescription(entry.description) === normalizeImportDescription(value.description ?? ""));
      const active = matches.filter(entry => !entry.removed), possible = active.length ? active : matches;
      if (possible.length > 1) { errors.push({ field: "description", line: record.line, message: `Line ${record.line}: several existing entries match. Resolve their descriptions before importing.` }); continue; }
      const old = possible[0];
      if (old?.entryId) matched.add(old.entryId);
      let amount: bigint | null;
      try { amount = parseImportAmount(value.planned_nok ?? ""); } catch { continue; }
      if (amount === null || amount < 0n || amount > 9223372036854775807n) { errors.push({ field: "planned_nok", line: record.line, message: `Line ${record.line}: enter a valid amount of zero or more.` }); continue; }
      const part = value.earmark_id ? snapshot.parts.find(part => part.id === value.earmark_id || part.reference === value.earmark_id) : null;
      if (value.earmark_id && (!part || (part.status === "deleted" && old?.earmarkId !== part.id))) errors.push({ field: "earmark_id", line: record.line, message: `Line ${record.line}: choose an available restricted funding part from this season.` });
      const next: Entry = { entryId: old?.entryId ?? null, systemId: system.id, description: old?.description ?? value.description ?? "", plannedOre: amount.toString(),
        ordinaryPriority: value.priority ?? old?.ordinaryPriority ?? "P2", category: value.category ?? old?.category ?? "other", reuseStatus: value.reuse_status ?? old?.reuseStatus ?? "new",
        expectedPurchaseDate: value.expected_purchase_date === undefined ? old?.expectedPurchaseDate ?? null : value.expected_purchase_date || null,
        ownerMemberId: old?.ownerMemberId ?? null, ownerEmail: old?.ownerEmail ?? null, note: value.note === undefined ? old?.note ?? null : value.note || null,
        earmarkId: value.earmark_id === undefined ? old?.earmarkId ?? null : part?.id ?? null, status: old && old.status !== "cancelled" ? old.status : "planned" };
      if (!["P1", "P2", "P3", "P4"].includes(next.ordinaryPriority)) errors.push({ field: "priority", line: record.line, message: `Line ${record.line}: choose an ordinary priority from P1 through P4.` });
      const before = old && !old.removed ? values(old) : null, after = values(next);
      const kind = before ? JSON.stringify(before) === JSON.stringify(after) ? "unchanged" : "changed" : "added";
      counts[kind]++; entries.push(next); totals.set(system.id, (totals.get(system.id) ?? 0n) + amount);
      rows.push({ line: record.line, systemCode: system.code, systemName: system.name, kind, before, after, actualNok: formatOre(BigInt(old?.actualOre ?? "0")) });
    }
    for (const old of snapshot.entries.filter(entry => !entry.removed && entry.entryId && !matched.has(entry.entryId))) {
      const system = snapshot.systems.find(sys => sys.id === old.systemId);
      counts.removed++; rows.push({ line: null, systemCode: system?.code ?? "", systemName: system?.name ?? "System", kind: "removed", before: values(old), after: null, actualNok: formatOre(BigInt(old.actualOre ?? "0")) });
    }
    const previewToken = createHash("sha256").update(JSON.stringify({ source: body.csv, header: body.projectBudgetId, revision: snapshot.revision, snapshot: snapshot.token, entries })).digest("hex");
    const preview: ProjectBudgetImportPreview = { projectBudgetId: body.projectBudgetId, candidateRevision: snapshot.revision, previewToken, departmentKey: "", viewVersion: Number(snapshot.version), rows, counts,
      subtotals: [...totals].map(([id, total]) => { const sys = snapshot.systems.find(sys => sys.id === id)!; return { systemCode: sys.code, systemName: sys.name, plannedNok: formatOre(total) }; }),
      totalNok: formatOre([...totals.values()].reduce((sum, value) => sum + value, 0n)), warnings: ["Descriptions identify entries. Changing a description adds an entry and removes its previous match from this candidate. The approved version remains available until both reviews complete."], errors };
    if (Buffer.byteLength(JSON.stringify(preview)) > 1024 * 1024) throw new FinanceError(413, "The preview exceeds 1 MiB. Reduce the CSV and try again.");
    return { preview, entries, snapshotToken: snapshot.token };
  } catch (error) { throw projectBudgetError(error); }
}
