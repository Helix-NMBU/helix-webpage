import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { escapeHtml, isValidEmail } from "./_lib/email.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.CONTACT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "no-reply@helixnmbu.no";
  if (!apiKey || !toEmail) {
    res.status(500).json({ error: "Email is not configured on the server." });
    return;
  }

  const { name, email, subject, message } = (req.body ?? {}) as Record<string, unknown>;
  if (
    typeof name !== "string" || !name.trim() ||
    typeof subject !== "string" || !subject.trim() ||
    typeof message !== "string" || !message.trim() ||
    !isValidEmail(email)
  ) {
    res.status(400).json({ error: "Please fill in every field with a valid email." });
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `Helix NMBU Website <${fromEmail}>`,
    to: toEmail,
    replyTo: email,
    subject: `[Contact form] ${subject}`,
    text: `From: ${name} <${email}>\n\n${message}`,
    html: `
      <p><strong>From:</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
      <p>${escapeHtml(message).replace(/\n/g, "<br />")}</p>
    `,
  });

  if (error) {
    console.error("Resend contact send failed", error);
    res.status(502).json({ error: "Failed to send message. Please try again in a moment." });
    return;
  }

  res.status(200).json({ ok: true });
}
