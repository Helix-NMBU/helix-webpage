import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Plugin } from "vite";
import { createSponsorAccess, SponsorError, type SponsorAccess, type SponsorDatabase } from "../api/_lib/sponsor-access.js";
import { generateCvPdf } from "../api/_lib/member-cv-pdf.js";
import type { CvObjectStorage } from "../api/_lib/member-cv-storage.js";
import { emptyCv } from "../src/features/MemberCV/model.js";

type Handler = (req: VercelRequest, res: VercelResponse) => unknown;
type LocalDependencies = { db: SponsorDatabase; access: SponsorAccess; storage: CvObjectStorage; authSendLink: () => Promise<void> };
type Factory = (deps: LocalDependencies) => Handler;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const address = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const ACCOUNTS = { sponsor: 1, admin: 2, bronze: 3, expired: 4, developer: 5, unentitled: 6 };

export function allowsSponsorLocalConfig(command: string, mode: string, host: unknown): boolean {
  return command === "serve" && mode === "sponsor-local" && typeof host === "string" && LOOPBACK.has(host);
}

export function allowsSponsorLocalRequest(host: string | undefined, remoteAddress: string | undefined): boolean {
  try {
    const parsed = new URL(`http://${host ?? ""}`);
    return LOOPBACK.has(parsed.hostname) && (LOOPBACK.has(remoteAddress ?? "") || remoteAddress === "::ffff:127.0.0.1")
      && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch { return false; }
}

/** An in-memory database and file store. It never reads environment credentials or opens service connections. */
export async function createSponsorLocalRuntime(createApi: Factory, root: string) {
  const db = new PGlite();
  await db.exec(`create schema neon_auth;
    create table neon_auth."user"(id uuid primary key,email text,name text,"emailVerified" boolean,banned boolean);
    create table neon_auth.account(id text,"userId" uuid,"providerId" text,"accountId" text,"idToken" text,"createdAt" timestamptz);`);
  for (const migration of ["001_member_cv.sql", "002_member_helix_role.sql", "003_sponsor_portal.sql", "004_sponsor_requests.sql"]) {
    await db.exec(await readFile(join(root, "db/migrations", migration), "utf8"));
  }
  const database = db as unknown as SponsorDatabase;
  for (const [label, number] of Object.entries(ACCOUNTS)) {
    await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [address(number), `${label}@example.invalid`, `${label[0].toUpperCase()}${label.slice(1)} Example`]);
  }
  for (const [label, number, tier, ended] of [["sponsor", 1, "silver", false], ["bronze", 3, "bronze", false], ["expired", 4, "gold", true], ["unentitled", 6, "service", false]] as const) {
    const organizationId = address(number + 100);
    await db.query("insert into sponsor.organizations(id,name) values($1,$2)", [organizationId, `${label[0].toUpperCase()}${label.slice(1)} Engineering`]);
    await db.query("insert into sponsor.contacts(organization_id,email,name,auth_user_id) values($1,$2,$3,$4)", [organizationId, `${label}@example.invalid`, `${label} contact`, address(number)]);
    await db.query("insert into sponsor.agreements(organization_id,tier,starts_at,ends_at) values($1,$2,now()-interval '1 year',now()+$3::interval)", [organizationId, tier, ended ? "-1 day" : "1 year"]);
  }
  await db.query("insert into sponsor.staff(id,email,role,auth_user_id) values($1,'admin@example.invalid','admin',$2),($3,'developer@example.invalid','developer',$4)", [address(202), address(2), address(205), address(5)]);
  const files = new Map<string, Uint8Array>();
  const downloads = new Map<string, { path: string; disposition: string; expires: number }>();
  const storage: CvObjectStorage = {
    async putPdf(path, bytes) { files.set(path, bytes); },
    async remove(path) { files.delete(path); },
    async presign(path, disposition = "attachment") {
      if (!files.has(path)) throw new SponsorError(404, "This CV is no longer available.");
      const grant = randomUUID();
      downloads.set(grant, { path, disposition, expires: Date.now() + 120_000 });
      return `/api/sponsor-local-cv?grant=${grant}`;
    },
  };
  for (const [number, fullName, programme, year, department, visible, share] of [
    [11, "Alex Example", "Mechanical engineering", "2027", "Mechanical", true, true],
    [12, "Sam Example", "Electronics", "2028", "Electrical", true, false],
    [13, "Private Example", "Robotics", "2029", "Electrical", false, false],
    [14, "Withdrawn Example", "Mechanical engineering", "2027", "Mechanical", true, true],
  ] as const) {
    const memberId = address(number + 300), authId = address(number + 400);
    const email = `fixture-${number}@helixnmbu.no`;
    await db.query('insert into neon_auth."user" values($1,$2,$3,true,false)', [authId, email, fullName]);
    await db.query("insert into identity.members(id,auth_user_id,google_sub,email,full_name) values($1,$2,$3,$4,$5)", [memberId, authId, `fixture-google-${number}`, email, fullName]);
    const cv = { ...emptyCv(fullName, `${fullName.toLowerCase().split(" ")[0]}@example.invalid`),
      phone: "+47 00000000", city: "Ås", headline: "Formula Student team member", summary: "I develop and test engineering solutions with the Helix team.",
      fieldOfStudy: programme, graduationYear: year, skills: number === 11 ? ["CAD", "Python"] : ["Electronics", "Python"],
      education: [{ id: "education", institution: "Example University", degree: programme, startDate: "2023", endDate: year, description: "Engineering studies" }],
      experience: [{ id: "helix", organization: "Helix NMBU", title: "Team member", department, season: "S27", startDate: "2026", endDate: "", description: "Design and testing" }],
    };
    const sharing = { cv: share, email: share, phone: false };
    await db.query("insert into cv.documents(member_id,draft,sharing) values($1,$2,$3)", [memberId, JSON.stringify(cv), JSON.stringify(sharing)]);
    if (visible) {
      const path = share ? `${memberId}/${randomUUID()}.pdf` : null;
      if (path) {
        await db.query("select cv.prepare_upload($1,$2,0)", [memberId, path]);
        await storage.putPdf(path, await generateCvPdf(cv, sharing, "en"));
      }
      await db.query("select cv.commit_member_cv($1,'publish',0,$2,$3,$4)", [memberId, JSON.stringify(cv), JSON.stringify(sharing), path]);
      if (number === 14) await db.query("select cv.commit_member_cv($1,'withdraw',1)", [memberId]);
      else await db.query("select cv.commit_member_cv($1,'save',1,$2,$3)", [memberId, JSON.stringify({ ...cv, fullName: `Private edits for ${fullName}` }), JSON.stringify(sharing)]);
    }
  }
  const access = createSponsorAccess({ db: database, verifySession: async (token) => {
    const label = token.replace(/^sponsor-local-/, "") as keyof typeof ACCOUNTS;
    if (!token.startsWith("sponsor-local-") || !Object.hasOwn(ACCOUNTS, label)) throw new SponsorError(401, "Sign in to continue.");
    return { userId: address(ACCOUNTS[label]) };
  } });
  const handler = createApi({ db: database, access, storage, authSendLink: async () => { throw new SponsorError(503, "Email delivery is unavailable in this local session."); } });
  return { handler, db, storage, async download(grant: string) {
    const item = downloads.get(grant);
    if (!item || item.expires <= Date.now()) return null;
    const bytes = files.get(item.path);
    return bytes ? { bytes, disposition: item.disposition } : null;
  }, close: () => db.close() };
}

export function createSponsorLocalPlugin(createApi: Factory): Plugin {
  let root = "";
  let allowed = false;
  return {
    name: "helix-sponsor-local",
    apply: "serve",
    configResolved(config) {
      root = config.root;
      allowed = allowsSponsorLocalConfig(config.command, config.mode, config.server.host);
      if (!allowed) throw new Error("Sponsor fixtures require the dedicated sponsor-local mode on an explicit loopback host.");
    },
    async configureServer(server) {
      if (!allowed) throw new Error("Sponsor fixtures are disabled.");
      const runtime = await createSponsorLocalRuntime(createApi, root);
      server.httpServer?.once("close", () => { void runtime.close(); });
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url?.startsWith("/api/sponsor")) return next();
        res.setHeader("Cache-Control", "no-store");
        if (!allowsSponsorLocalRequest(req.headers.host, req.socket.remoteAddress)) { res.statusCode = 403; return res.end("Loopback access is required."); }
        try {
          const url = new URL(req.url, "http://localhost");
          if (url.pathname === "/api/sponsor-local-cv") {
            const file = req.method === "GET" ? await runtime.download(url.searchParams.get("grant") ?? "") : null;
            if (!file) { res.statusCode = 404; return res.end("CV unavailable."); }
            res.setHeader("Content-Type", "application/pdf");
            res.setHeader("X-Content-Type-Options", "nosniff");
            res.setHeader("Content-Disposition", `${file.disposition}; filename="helix-cv.pdf"`);
            return res.end(file.bytes);
          }
          if (url.pathname !== "/api/sponsor") { res.statusCode = 404; return res.end(); }
          let body = "";
          for await (const chunk of req) { body += String(chunk); if (body.length > 65_536) { res.statusCode = 413; return res.end("Request too large."); } }
          const request = req as VercelRequest;
          request.query = Object.fromEntries(url.searchParams);
          request.body = body ? JSON.parse(body) : undefined;
          const response = res as VercelResponse;
          response.status = (status: number) => { response.statusCode = status; return response; };
          response.json = (value: unknown) => { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(value)); return response; };
          await runtime.handler(request, response);
        } catch { if (!res.headersSent) res.statusCode = 500; res.end(JSON.stringify({ error: "Local sponsor request failed." })); }
      });
    },
  };
}
