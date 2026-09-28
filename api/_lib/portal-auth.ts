import { createClient } from "@supabase/supabase-js";

export function portalClients(authorization?: string) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) throw new Error("Portal Supabase server variables are missing.");
  const token = authorization?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Missing bearer token.");
  return {
    token,
    auth: createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } }),
    admin: createClient(url, service, { auth: { persistSession: false } }),
  };
}

export async function requirePortalAdmin(authorization?: string) {
  const clients = portalClients(authorization);
  const { data, error } = await clients.auth.auth.getUser(clients.token);
  if (error || !data.user?.email) throw new Error("Invalid session.");
  const { data: member } = await clients.admin.from("members").select("id").eq("email", data.user.email.toLowerCase()).eq("status", "active").eq("has_sponsor_portal_access", true).maybeSingle();
  if (!member) throw new Error("Sponsor Portal Administrator access required.");
  return { ...clients, user: data.user };
}

export async function requirePortalUser(authorization?: string) {
  const clients = portalClients(authorization);
  const { data, error } = await clients.auth.auth.getUser(clients.token);
  if (error || !data.user?.email) throw new Error("Invalid session.");
  return { ...clients, user: data.user };
}

