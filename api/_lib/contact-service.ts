import pg from "pg";
import { Resend } from "resend";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { CvDatabase } from "./member-cv-service.js";
import { withVerifyFullSsl } from "./pg-ssl.js";
import { isValidEmail } from "./email.js";

type Contact = { name: string; email: string; subject: string; message: string };
type Sender = (input: Contact) => Promise<void>;
let pool: pg.Pool | undefined;

function contact(body: unknown): Contact | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const input = body as Record<string, unknown>;
  for (const [key, max] of Object.entries({ name: 200, subject: 250, message: 8000 })) {
    const value = input[key];
    if (typeof value !== "string" || !value.trim() || value.length > max) return null;
  }
  if (!isValidEmail(input.email) || String(input.email).length > 254) return null;
  return { name: String(input.name).trim(), email: String(input.email).trim().toLowerCase(),
    subject: String(input.subject).trim(), message: String(input.message).trim() };
}

export function createContactHandler(options: { database: () => CvDatabase; send: Sender; enabled: boolean }) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed." }); }
    const input = contact(req.body);
    if (!input) return res.status(400).json({ error: "Fill in every field with a valid email. Keep the message under 8,000 characters." });
    try {
      const db = options.database();
      const saved = await db.query<{ id: string }>(`insert into website.contact_messages (name, email, subject, message)
        values ($1, $2, $3, $4) returning id`, [input.name, input.email, input.subject, input.message]);
      const id = saved.rows[0]?.id;
      if (!id) throw new Error("Contact was not saved");
      if (options.enabled) {
        let status: "sent" | "failed" = "sent";
        try { await options.send(input); } catch { status = "failed"; }
        // Delivery is best-effort after durable receipt. An uncertain status
        // write must not ask the visitor to submit a saved message again.
        await db.query("update website.contact_messages set email_status = $2 where id = $1::uuid", [id, status]).catch(() => undefined);
      }
      return res.status(201).json({ ok: true });
    } catch { return res.status(503).json({ error: "Could not save your message. Please try again." }); }
  };
}

export function contactEmailEnabled(env: NodeJS.ProcessEnv): boolean {
  const recipient = env.CONTACT_TO_EMAIL;
  const allowed = (env.WEBSITE_EMAIL_TEST_RECIPIENTS ?? "").split(",").map(value => value.trim().toLowerCase());
  return env.WEBSITE_EMAIL_ENABLED === "true" && Boolean(env.RESEND_API_KEY) && Boolean(recipient)
    && (env.HELIX_ENVIRONMENT === "production" || (env.HELIX_ENVIRONMENT === "local" && allowed.includes(recipient!.toLowerCase())));
}

export function neonContactHandler(env: NodeJS.ProcessEnv = process.env) {
  return createContactHandler({
    database() {
      if (!env.DATABASE_URL) throw new Error("Neon database is not configured");
      pool ??= new pg.Pool({ connectionString: withVerifyFullSsl(env.DATABASE_URL), max: 1 });
      return { async query<T>(sql: string, params?: unknown[]) {
        const result = await pool!.query(sql, params); return { rows: result.rows as T[] };
      } };
    },
    enabled: contactEmailEnabled(env),
    async send(input) {
      const result = await new Resend(env.RESEND_API_KEY).emails.send({
        from: `Helix NMBU Website <${env.CONTACT_FROM_EMAIL || "no-reply@helixnmbu.no"}>`,
        to: env.CONTACT_TO_EMAIL!, replyTo: input.email, subject: `[Contact form] ${input.subject}`,
        text: `From: ${input.name} <${input.email}>\n\n${input.message}`,
      });
      if (result.error) throw new Error("Delivery failed");
    },
  });
}
