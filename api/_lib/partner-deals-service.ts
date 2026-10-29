import pg from "pg";
import { MemberCvError } from "./member-cv-error.js";
import { neonCvServices, type CvDatabase, type WorkspaceIdentity } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";

type DealView = "pipeline" | "shared";
export type DealWorkspace = { canManage: boolean; deals: unknown[]; organizations: unknown[]; seasons: unknown[] };
export interface DealServices {
  load(token: string, view: DealView): Promise<DealWorkspace>;
  createOrganization(token: string, name: unknown): Promise<{ id: string }>;
  renameOrganization(token: string, id: unknown, revision: unknown, name: unknown): Promise<{ id: string }>;
  save(token: string, body: unknown): Promise<{ id: string }>;
}

// One SQL statement binds the projection to the current grant and linked Google identity.
// The shared view never includes pre-won deals or private negotiation notes.
const readSql = `select caps.pipeline as "canManage",
 coalesce((select jsonb_agg(jsonb_build_object(
  'id',d.id,'organizationId',d.organization_id,'organizationName',o.name,'title',d.title,'stage',d.stage,
  'ownerMemberId',d.owner_member_id,'contactName',d.contact_name,'contactEmail',d.contact_email,
  'startsOn',d.starts_on,'endsOn',d.ends_on,'agreementLink',d.agreement_link,'revision',d.revision,
  'wonAt',d.won_at,'wonByMemberId',d.won_by_member_id,
  'contributions',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'seasonId',c.season_id,'kind',c.kind,'description',c.description,'amountOre',c.amount_ore::text,'invoiceDate',c.invoice_date) order by c.id) from partner_deals.contributions c where c.deal_id=d.id),'[]'::jsonb),
  'deliverables',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'description',v.description,'dueDate',v.due_date,'ownerMemberId',v.owner_member_id) order by v.id) from partner_deals.deliverables v where v.deal_id=d.id),'[]'::jsonb)
 ) || case when $4='pipeline' then jsonb_build_object('negotiationNotes',d.negotiation_notes) else '{}'::jsonb end order by d.updated_at desc,d.id)
 from partner_deals.deals d join partner.organizations o on o.id=d.organization_id
 where ($4='pipeline' or d.stage='won')),'[]'::jsonb) as deals,
 case when $4='pipeline' then coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'revision',coalesce(v.revision,0)) order by lower(o.name),o.id) from partner.organizations o left join partner_deals.organization_versions v on v.organization_id=o.id),'[]'::jsonb) else '[]'::jsonb end as organizations,
 case when $4='pipeline' then coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'name',s.name,'startDate',s.start_date,'endDate',s.end_date,'status',s.status) order by s.start_date) from finance.seasons s),'[]'::jsonb) else '[]'::jsonb end as seasons
 from partner_deals.capabilities($1::uuid,$2,$3) caps where case when $4='pipeline' then caps.pipeline else caps.shared end`;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberCvError(400, "Check the deal details and try again.");
  return value as Record<string, unknown>;
}
function checkSave(value: unknown): Record<string, unknown> {
  const data = record(value);
  if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 200 || typeof data.organizationId !== "string" ||
      typeof data.stage !== "string" || !["lead", "contacted", "discussion", "proposal", "lost"].includes(data.stage) ||
      !Array.isArray(data.contributions) || data.contributions.length > 100 || !Array.isArray(data.deliverables) || data.deliverables.length > 100 ||
      (data.id !== undefined && (typeof data.id !== "string" || !Number.isSafeInteger(data.expectedRevision) || Number(data.expectedRevision) < 0))) {
    throw new MemberCvError(400, "Check the deal details and try again.");
  }
  if (data.agreementLink !== undefined && data.agreementLink !== "") {
    if (typeof data.agreementLink !== "string") throw new MemberCvError(400, "Enter a valid agreement link.");
    try { if (!["http:","https:"].includes(new URL(data.agreementLink).protocol)) throw new Error(); } catch { throw new MemberCvError(400, "Enter a valid agreement link."); }
  }
  for (const item of data.contributions) {
    const c = record(item);
    if (typeof c.seasonId !== "string" || !["cash", "product", "service"].includes(String(c.kind)) ||
        (c.amountOre != null && (typeof c.amountOre !== "string" || !/^[1-9][0-9]{0,17}$/.test(c.amountOre))) ||
        (c.kind === "cash" && (typeof c.amountOre !== "string" || typeof c.invoiceDate !== "string")) ||
        (c.kind !== "cash" && c.invoiceDate != null && c.invoiceDate !== "")) throw new MemberCvError(400, "Check the contribution details and try again.");
  }
  for (const item of data.deliverables) {
    const d = record(item);
    if (typeof d.title !== "string" || !d.title.trim() || d.title.length > 200) throw new MemberCvError(400, "Check the deliverable details and try again.");
  }
  return data;
}
function errorFor(error: unknown): never {
  if (error instanceof MemberCvError) throw error;
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (message.includes("deal_forbidden") || code === "42501") throw new MemberCvError(403, "You do not have access to sponsor deals.");
  if (message.includes("deal_not_found")) throw new MemberCvError(404, "This deal is no longer available.");
  if (message.includes("deal_conflict") || message.includes("deal_won_locked") || code === "40001") throw new MemberCvError(409, "This deal changed or has been won. Reload it before saving.");
  if (message.includes("deal_invalid") || ["23502","23503","23505","23514","22007","22008","22P02","22003"].includes(code)) throw new MemberCvError(400, "Check the deal details and try again.");
  throw new MemberCvError(503, "Sponsor deals are temporarily unavailable. Your input has been kept.");
}
export function createDealServices(deps: { db: CvDatabase; authenticate(token: string): Promise<WorkspaceIdentity> }): DealServices {
  const identity = async (token: string) => deps.authenticate(token);
  return {
    async load(token, view) {
      try {
        if (view !== "pipeline" && view !== "shared") throw new MemberCvError(400, "Choose a valid deal view.");
        const actor = await identity(token);
        const result = await deps.db.query<DealWorkspace>(readSql, [actor.userId,actor.googleSub,actor.email,view]);
        if (!result.rows[0]) throw new MemberCvError(403, "You do not have access to sponsor deals.");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
    async createOrganization(token, name) {
      try {
        if (typeof name !== "string" || !name.trim() || name.length > 200) throw new MemberCvError(400, "Enter a partner name.");
        const actor = await identity(token);
        const result = await deps.db.query<{id: string}>("select partner_deals.create_organization($1::uuid,$2,$3,$4) as id", [actor.userId,actor.googleSub,actor.email,name]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
    async renameOrganization(token, id, revision, name) {
      try {
        if (typeof id !== "string" || !Number.isSafeInteger(revision) || Number(revision) < 0 || typeof name !== "string" || !name.trim() || name.length > 200) throw new MemberCvError(400, "Check the partner details.");
        const actor = await identity(token);
        const result = await deps.db.query<{id: string}>("select partner_deals.rename_organization($1::uuid,$2,$3,$4::uuid,$5::integer,$6) as id", [actor.userId,actor.googleSub,actor.email,id,revision,name]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
    async save(token, body) {
      try {
        const actor = await identity(token); const data = checkSave(body);
        const result = await deps.db.query<{id: string}>("select partner_deals.save_deal($1::uuid,$2,$3,$4::jsonb) as id", [actor.userId,actor.googleSub,actor.email,JSON.stringify(data)]);
        if (!result.rows[0]?.id) throw new Error("Missing identifier");
        return result.rows[0];
      } catch (error) { return errorFor(error); }
    },
  };
}
let pool: pg.Pool | undefined;
export function neonDealServices(): DealServices {
  const url = process.env.DATABASE_URL;
  if (!url) throw new MemberCvError(503, "Sponsor deals are not configured.");
  pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(url), max: 1 });
  return createDealServices({ db: { async query<T>(sql: string, params?: unknown[]) { return { rows: (await pool!.query(sql,params)).rows as T[] }; } }, authenticate: token => neonCvServices().authenticate(token) });
}
