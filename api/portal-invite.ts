import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { requirePortalAdmin } from "./_lib/portal-auth.js";
import { escapeHtml } from "./_lib/email.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { admin } = await requirePortalAdmin(req.headers.authorization);
    const { contactId } = req.body as { contactId?: string };
    if (!contactId) return res.status(400).json({ error: "contactId is required" });
    const { data: contact, error } = await admin.from("sponsor_contacts").select("email,full_name,sponsor_organizations(name)").eq("id", contactId).single();
    if (error || !contact) throw error ?? new Error("Contact not found.");
    const appUrl = process.env.PUBLIC_SITE_URL ?? "https://helixnmbu.no";
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: contact.email, options: { redirectTo: `${appUrl}/portal` } });
    if (linkError) throw linkError;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is missing.");
    const organization = Array.isArray(contact.sponsor_organizations) ? contact.sponsor_organizations[0]?.name : (contact.sponsor_organizations as { name?: string } | null)?.name;
    const { error: deliveryError } = await new Resend(apiKey).emails.send({
      from: process.env.PORTAL_FROM_EMAIL ?? "Helix Sponsor Portal <no-reply@helixnmbu.no>",
      to: contact.email,
      subject: "Your Helix Sponsor Portal invitation",
      html: `<p>Hello ${escapeHtml(contact.full_name)},</p><p>Helix has invited you to the Sponsor Portal for ${escapeHtml(organization ?? "your organization")}.</p><p><a href="${escapeHtml(linkData.properties.action_link)}">Open the Sponsor Portal</a></p><p>This link is personal. Do not forward it.</p>`,
    });
    if (deliveryError) throw new Error(deliveryError.message);
    const { error: updateError } = await admin.from("sponsor_contacts").update({ invited_at: new Date().toISOString() }).eq("id", contactId);
    if (updateError) throw updateError;
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(403).json({ error: error instanceof Error ? error.message : "Invitation failed" });
  }
}
