import { Resend } from "resend";
import { escapeHtml } from "./email.js";
import type { CvDatabase } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import type { ApplicationRow } from "./website-validation.js";

export type EmailStatus = "skipped" | "sent";
export type WebsiteEmailMessage = { from: string; to: string } & (
  { template: { id: string; variables: { POSITION: string } } }
  | { subject: string; text: string; html: string }
);
// Preserve the pre-migration Resend template and rejection message. All
// substitutions come from the saved application, never the request body.
export function websiteEmailMessage(row: ApplicationRow, kind: "confirmation" | "rejection", fromEmail: string): WebsiteEmailMessage {
  if (kind === "confirmation") return {
    from: `Helix NMBU <${fromEmail}>`, to: row.email,
    template: { id: "takk-for-din-sknad", variables: { POSITION: row.position_title } },
  };
  return {
    from: `Helix NMBU Recruitment <${fromEmail}>`, to: row.email,
    subject: `Your application to Helix NMBU — ${row.position_title}`,
    text:
      `Hi ${row.full_name},\n\n` +
      `Thank you for applying to Helix NMBU for the ${row.position_title} position (${row.season}). ` +
      `After careful consideration, we've decided to move forward with other candidates this time.\n\n` +
      `We really appreciated the time you put into your application, and we'd love to see you apply again in the future.\n\n` +
      `Best regards,\nHelix NMBU Recruitment Team`,
    html: `
      <p>Hi ${escapeHtml(row.full_name)},</p>
      <p>Thank you for applying to Helix NMBU for the <strong>${escapeHtml(row.position_title)}</strong> position
      (${escapeHtml(row.season)}). After careful consideration, we've decided to move forward with other candidates
      this time.</p>
      <p>We really appreciated the time you put into your application, and we'd love to see you apply again in
      the future.</p>
      <p>Best regards,<br />Helix NMBU Recruitment Team</p>
    `,
  };
}
export type WebsiteMailer = (row: ApplicationRow, kind: "confirmation" | "rejection") => Promise<EmailStatus>;
export function createWebsiteMailer(db: CvDatabase, env: NodeJS.ProcessEnv = process.env,
  send = async (message: WebsiteEmailMessage, key: string) => {
    const result = await new Resend(env.RESEND_API_KEY).emails.send(message, { idempotencyKey: key });
    if (result.error) throw new Error("Email provider failed");
  },
): WebsiteMailer {
  return async (row, kind) => {
    const recipients = (env.WEBSITE_EMAIL_TEST_RECIPIENTS ?? "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
    const enabled = env.WEBSITE_EMAIL_ENABLED === "true" && Boolean(env.RESEND_API_KEY)
      && (env.HELIX_ENVIRONMENT === "production" || (["local", "development"].includes(env.HELIX_ENVIRONMENT ?? "") && recipients.includes(row.email.toLowerCase())));
    if (!enabled) {
      await db.query("insert into website.email_events (application_id, kind, status) values ($1, $2, 'skipped') on conflict do nothing", [row.id, kind]);
      return "skipped";
    }
    // Unknown provider outcomes remain 'sending' for manual review. Do not
    // blindly retry after the provider's idempotency window has elapsed.
    const claim = await db.query<{ status: string }>(`insert into website.email_events (application_id, kind, status)
      values ($1, $2, 'sending') on conflict (application_id, kind) do update set status = 'sending'
      where website.email_events.status = 'failed' returning status`, [row.id, kind]);
    if (!claim.rows.length) {
      const existing = (await db.query<{ status: string }>("select status from website.email_events where application_id = $1 and kind = $2", [row.id, kind])).rows[0];
      if (existing?.status === "sent" || existing?.status === "skipped") return existing.status;
      throw new MemberCvError(409, "Email delivery is awaiting confirmation. Contact Helix before retrying.");
    }
    try {
      await send(websiteEmailMessage(row, kind, env.CONTACT_FROM_EMAIL || "no-reply@helixnmbu.no"), `website-${kind}-${row.id}`);
      await db.query("update website.email_events set status = 'sent' where application_id = $1 and kind = $2", [row.id, kind]);
      return "sent";
    } catch { throw new MemberCvError(503, "Email delivery could not be confirmed. The application has been preserved for review."); }
  };
}
