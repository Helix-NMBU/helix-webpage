import { timingSafeEqual } from "node:crypto";
import pg from "pg";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withVerifyFullSsl } from "./pg-ssl.js";

type RunResult = { created: number; failed: number; failures: unknown[] };
export function createPartnerInvoiceRunner(deps: { secret(): string | undefined; run(): Promise<RunResult> }) {
 return async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
  const secret=deps.secret();
  if (!secret || secret.length < 32) return res.status(503).json({ error: "Invoice scheduling is not configured." });
  const header=typeof req.headers.authorization === "string" ? req.headers.authorization : "";
  const expected=Buffer.from(`Bearer ${secret}`); const actual=Buffer.from(header);
  if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return res.status(401).json({ error: "Unauthorized." });
  try {
   const result=await deps.run();
   return res.status(result.failed ? 503 : 200).json(result);
  } catch { return res.status(503).json({ error: "Invoice tasks could not be created. Check season setup and retry." }); }
 };
}
let pool: pg.Pool | undefined;
export const partnerInvoiceRunner = createPartnerInvoiceRunner({
 secret: () => process.env.PARTNER_INVOICE_RUNNER_SECRET,
 async run() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured");
  pool ??= new pg.Pool({connectionString:withVerifyFullSsl(process.env.DATABASE_URL),max:1});
  const result=await pool.query<{result:RunResult}>("select partner_deals.run_due_invoices() as result");
  if (!result.rows[0]?.result) throw new Error("Missing runner result");
  return result.rows[0].result;
 },
});
