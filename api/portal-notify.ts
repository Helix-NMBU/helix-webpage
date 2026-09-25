import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { requirePortalUser } from "./_lib/portal-auth.js";
import { escapeHtml } from "./_lib/email.js";

const tableByEvent: Record<string, string> = {
  request_created: "sponsor_requests",
  opportunity_submitted: "member_opportunities",
  engagement_requested: "helix_engagements",
  member_responded: "member_responses",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { admin, user } = await requirePortalUser(req.headers.authorization);
    const { event, recordId, entity } = req.body as { event?: string; recordId?: string; entity?: string };
    if (!event || !recordId) return res.status(400).json({ error: "event and recordId are required" });
    const table = event === "status_changed" ? entity : tableByEvent[event];
    if (!table || !["sponsor_requests", "member_opportunities", "helix_engagements", "member_responses"].includes(table)) return res.status(400).json({ error: "Unsupported event" });
    const { data: record, error } = await admin.from(table).select("*").eq("id", recordId).single();
    if (error || !record) throw error ?? new Error("Record not found.");
    const [{ data: adminMember }, { data: sponsorContact }] = await Promise.all([
      admin.from("members").select("id").eq("email", user.email!.toLowerCase()).eq("status", "active").eq("has_sponsor_portal_access", true).maybeSingle(),
      admin.from("sponsor_contacts").select("organization_id").eq("email", user.email!.toLowerCase()).eq("is_active", true).maybeSingle(),
    ]);
    if (event === "status_changed" && !adminMember) throw new Error("Administrator access required.");
    if (["request_created", "opportunity_submitted", "engagement_requested"].includes(event) && record.organization_id !== sponsorContact?.organization_id) throw new Error("This record does not belong to your organization.");
    if (event === "member_responded" && record.member_user_id !== user.id) throw new Error("This response does not belong to you.");
    let organizationId = record.organization_id as string | undefined;
    if (!organizationId && table === "member_responses") {
      const { data: opportunity } = await admin.from("member_opportunities").select("organization_id,title").eq("id", record.opportunity_id).single();
      organizationId = opportunity?.organization_id;
    }
    const { data: organization } = organizationId ? await admin.from("sponsor_organizations").select("name").eq("id", organizationId).single() : { data: null };
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not configured");
    const resend = new Resend(resendApiKey);
    const from = process.env.PORTAL_FROM_EMAIL ?? "Helix Sponsor Portal <no-reply@helixnmbu.no>";
    if (["request_created", "opportunity_submitted", "engagement_requested", "member_responded"].includes(event)) {
      await resend.emails.send({ from, to: process.env.SPONSORSHIPS_TO_EMAIL ?? "sponsorships@helixnmbu.no", subject: `Sponsor Portal: ${event.replaceAll("_", " ")}`, html: `<p>${escapeHtml(organization?.name ?? "A portal user")} created activity requiring attention.</p><p>Submitted by ${escapeHtml(user.email ?? "unknown") }.</p><p>Record: ${escapeHtml(recordId)}</p>` });
    }
    if (event === "status_changed" && organizationId) {
      const { data: contacts } = await admin.from("sponsor_contacts").select("email").eq("organization_id", organizationId).eq("is_active", true);
      const recipients = (contacts ?? []).map((contact) => contact.email);
      if (recipients.length) await resend.emails.send({ from, to: recipients, subject: "Your Helix Sponsor Portal item was updated", html: `<p>Hello,</p><p>Helix updated an item for ${escapeHtml(organization?.name ?? "your organization")} to <strong>${escapeHtml(String(record.status).replaceAll("_", " "))}</strong>.</p><p>Sign in to the portal for details.</p>` });
      if (table === "member_opportunities" && record.status === "published" && process.env.MEMBER_OPPORTUNITIES_EMAIL) await resend.emails.send({ from, to: process.env.MEMBER_OPPORTUNITIES_EMAIL, subject: `New Helix member opportunity: ${record.title}`, html: `<p>A new ${escapeHtml(String(record.kind).replaceAll("_", " "))} is available on the Member Opportunity Board.</p><p>${escapeHtml(String(record.summary))}</p>` });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : "Notification failed" });
  }
}
