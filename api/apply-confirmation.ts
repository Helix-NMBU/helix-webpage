import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { isValidEmail } from "./_lib/email.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  const { application_id, email } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof application_id !== "string" || !UUID_RE.test(application_id) || !isValidEmail(email)) {
    res.status(400).json({ error: "Missing or invalid application details." });
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: positionTitle, error: lookupError } = await supabase.rpc("application_position", {
    p_id: application_id,
    p_email: email,
  });
  if (lookupError) {
    console.error("Application lookup failed", lookupError);
    res.status(502).json({ error: "Could not verify the application. Please try again." });
    return;
  }
  if (typeof positionTitle !== "string" || !positionTitle) {
    res.status(404).json({ error: "No matching application found." });
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: `Helix NMBU <${fromEmail}>`,
    to: email,
    template: {
      id: "takk-for-din-sknad",
      variables: { POSITION: positionTitle },
    },
  });

  if (error) {
    console.error("Resend confirmation send failed", error);
    res.status(502).json({ error: "Failed to send confirmation email." });
    return;
  }

  res.status(200).json({ ok: true });
}
