import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SponsorError, requirePortal, sponsorBearer, type SponsorAccess, type SponsorDatabase } from "./sponsor-access.js";
import type { SponsorContext } from "../../src/features/SponsorWorkspace/types.js";
import type { RequestAdmin, RequestDetail, RequestHistory, RequestList, RequestReply, RequestSummary } from "../../src/features/SponsorWorkspace/request-types.js";
import { RequestWorkflowError, validateExpectedRevision, validateRequestDraft, validateRequestReply, REQUEST_STATUSES, type RequestStatus } from "../../src/features/SponsorWorkspace/requests.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requestId(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new SponsorError(400, "A valid request ID is required.");
  return value;
}
function inputObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SponsorError(400, "Send a request object.");
  return value as Record<string, unknown>;
}
function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : String(value); }
function summary(row: Record<string, unknown>): RequestSummary {
  return {
    id: String(row.id), organizationId: String(row.organization_id), organizationName: String(row.organization_name),
    type: row.type as RequestSummary["type"], title: String(row.title), status: row.status as RequestStatus,
    revision: Number(row.revision), assignedAdminId: row.assigned_admin_id as string | null,
    assignedAdminName: row.assigned_admin_email as string | null, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
  };
}
function accessScope(context: SponsorContext): string | null {
  if (context.role === "admin") return null;
  requirePortal(context);
  return context.organizationId;
}
function sqlError(error: unknown): never {
  if (error instanceof SponsorError || error instanceof RequestWorkflowError) throw error;
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code === "P0002") throw new SponsorError(404, "Request was not found.");
  if (code === "40001") throw new SponsorError(409, error instanceof Error ? error.message : "This request changed. Reload it before trying again.");
  if (code === "42501") throw new SponsorError(403, "Your current access or assignment does not allow this action.");
  if (["22023", "22P02", "23514"].includes(code)) throw new SponsorError(400, "Check the request fields and choose an active administrator.");
  throw new SponsorError(503, "Could not save the request. Reload it before trying again.");
}
const SELECT_REQUEST = `select r.id, coalesce(o.id, po.id)::text as organization_id,
    coalesce(o.name, po.name) as organization_name, r.type, r.title, r.status, r.revision,
    r.assigned_admin_id, s.email as assigned_admin_email, r.created_at, r.updated_at,
    r.body, r.author_email
  from sponsor.requests r left join sponsor.organizations o on o.id = r.organization_id
  left join partner.organizations po on po.id = r.partner_organization_id
  left join sponsor.staff s on s.id = r.assigned_admin_id`;

export function createSponsorRequests(deps: { db: SponsorDatabase; access: SponsorAccess }) {
  const { db, access } = deps;
  async function read(context: SponsorContext, id: unknown): Promise<RequestDetail> {
    const organizationId = accessScope(context);
    const rows = await db.query(`${SELECT_REQUEST} where r.id = $1 and ($2::uuid is null or r.organization_id = $2)`, [requestId(id), organizationId]);
    const row = rows.rows[0];
    if (!row) throw new SponsorError(404, "Request was not found.");
    const replies = (await db.query(`select id, author_email, actor, body, created_at from sponsor.request_replies where request_id = $1 order by created_at, id`, [id])).rows;
    const history = (await db.query(`select id, revision, actor_email, kind, from_status, to_status, assigned_admin_email, created_at from sponsor.request_history where request_id = $1 order by revision`, [id])).rows;
    return { ...summary(row), body: String(row.body), authorEmail: String(row.author_email),
      replies: replies.map((reply): RequestReply => ({ id: String(reply.id), authorEmail: String(reply.author_email), actor: reply.actor as RequestReply["actor"], body: String(reply.body), createdAt: iso(reply.created_at) })),
      history: history.map((event): RequestHistory => ({ id: String(event.id), revision: Number(event.revision), actorEmail: String(event.actor_email), kind: event.kind as RequestHistory["kind"], fromStatus: event.from_status as RequestStatus | null, toStatus: event.to_status as RequestStatus | null, assignedAdminEmail: event.assigned_admin_email as string | null, createdAt: iso(event.created_at) })),
    };
  }
  return {
    async handle(req: VercelRequest): Promise<RequestList | { request: RequestDetail }> {
      const context = await access.authenticate(sponsorBearer(req.headers.authorization));
      const organizationId = accessScope(context);
      const action = req.query.action;
      if (req.method === "GET" && action === "requests") {
        const requests = (await db.query(`${SELECT_REQUEST} where ($1::uuid is null or r.organization_id = $1) order by r.updated_at desc, r.id`, [organizationId])).rows.map(summary);
        const administrators = context.role === "admin" ? (await db.query<RequestAdmin>(
          `select s.id, s.email from sponsor.staff s join neon_auth."user" u on u.id = s.auth_user_id
           where s.active and s.role = 'admin' and lower(u.email) = s.email and u."emailVerified" and not coalesce(u.banned, false) order by s.email`,
        )).rows : [];
        return { requests, administrators };
      }
      if (req.method === "GET" && action === "request") return { request: await read(context, req.query.id) };
      if (req.method !== "POST" || !["requests", "request"].includes(String(action))) throw new SponsorError(405, "Method not allowed.");
      try {
        if (action === "requests") {
          requirePortal(context);
          const input = validateRequestDraft(req.body);
          const result = await db.query<{ id: string }>("select sponsor.create_request($1,$2,$3,$4) as id", [context.authUserId, input.type, input.title, input.body]);
          return { request: await read(context, result.rows[0].id) };
        }
        const input = inputObject(req.body);
        const id = requestId(input.id);
        const revision = validateExpectedRevision(input.expectedRevision);
        const operation = input.operation;
        let payload: Record<string, unknown>;
        const keys = ["id", "expectedRevision", "operation"];
        if (operation === "reply") { payload = { body: validateRequestReply(input.body) }; keys.push("body"); }
        else if (operation === "status") {
          if (!REQUEST_STATUSES.includes(input.status as RequestStatus)) throw new SponsorError(400, "Choose a valid request status.");
          payload = { status: input.status }; keys.push("status");
        } else if (operation === "assign") { payload = { assigneeId: requestId(input.assigneeId) }; keys.push("assigneeId"); }
        else throw new SponsorError(400, "Choose a valid request operation.");
        if (Object.keys(input).some(key => !keys.includes(key))) throw new SponsorError(400, "Unexpected request fields.");
        await db.query("select sponsor.mutate_request($1,$2,$3,$4,$5::jsonb)", [context.authUserId, id, revision, operation, JSON.stringify(payload)]);
        return { request: await read(context, id) };
      } catch (error) { return sqlError(error); }
    },
  };
}

export function createSponsorRequestsHandler(deps: { db: SponsorDatabase; access: SponsorAccess }) {
  const service = createSponsorRequests(deps);
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    try { return res.status(200).json(await service.handle(req)); }
    catch (error) {
      if (error instanceof SponsorError || error instanceof RequestWorkflowError) return res.status(error.status).json({ error: error.message });
      return res.status(503).json({ error: "Could not load requests. Try again." });
    }
  };
}
