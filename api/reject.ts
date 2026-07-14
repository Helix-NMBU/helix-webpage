import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { escapeHtml, isValidEmail } from "./_lib/email.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FROM_EMAIL || "no-reply@helixnmbu.no";
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!apiKey || !supabaseUrl || !supabaseAnonKey) {
    res.status(500).json({ error: "Email is not configured on the server." });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing authorization." });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    res.status(401).json({ error: "Invalid session." });
    return;
  }

  const { data: isRecruiter, error: recruiterError } = await supabase.rpc("is_recruiter");
  if (recruiterError || !isRecruiter) {
    res.status(403).json({ error: "Not authorized to send rejection emails." });
    return;
  }

  const { to_email, applicant_name, position_title, season } = (req.body ?? {}) as Record<string, unknown>;
  if (
    !isValidEmail(to_email) ||
    typeof applicant_name !== "string" || !applicant_name.trim() ||
    typeof position_title !== "string" || !position_title.trim() ||
    typeof season !== "string" || !season.trim()
  ) {
    res.status(400).json({ error: "Missing or invalid applicant details." });
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `Helix NMBU Recruitment <${fromEmail}>`,
    to: to_email,
    subject: `Your application to Helix NMBU — ${position_title}`,
    text:
      `Hi ${applicant_name},\n\n` +
      `Thank you for applying to Helix NMBU for the ${position_title} position (${season}). ` +
      `After careful consideration, we've decided to move forward with other candidates this time.\n\n` +
      `We really appreciated the time you put into your application, and we'd love to see you apply again in the future.\n\n` +
      `Best regards,\nHelix NMBU Recruitment Team`,
    html: `
      <p>Hi ${escapeHtml(applicant_name)},</p>
      <p>Thank you for applying to Helix NMBU for the <strong>${escapeHtml(position_title)}</strong> position
      (${escapeHtml(season)}). After careful consideration, we've decided to move forward with other candidates
      this time.</p>
      <p>We really appreciated the time you put into your application, and we'd love to see you apply again in
      the future.</p>
      <p>Best regards,<br />Helix NMBU Recruitment Team</p>
    `,
  });

  if (error) {
    console.error("Resend rejection send failed", error);
    res.status(502).json({ error: "Failed to send rejection email. Please try again." });
    return;
  }

  res.status(200).json({ ok: true });
}
