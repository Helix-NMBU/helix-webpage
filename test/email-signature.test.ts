import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEmailSignatureServices } from "../api/_lib/email-signature-service.js";
import { defaultSignatureSettings, parseSignatureSettings, renderSignature } from "../src/features/MemberPlatform/email-signature.js";

const adminId = "10000000-0000-4000-8000-000000000001";
const memberId = "20000000-0000-4000-8000-000000000001";
let pg: PGlite;
let services: ReturnType<typeof createEmailSignatureServices>;
beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`create role authenticated; create schema identity;
    create table identity.members (id uuid primary key, google_sub text, email text, full_name text, helix_role text);
    create table identity.member_roles (member_id uuid, role_key text);
    insert into identity.members values ('${adminId}', 'admin-google', 'admin@helixnmbu.no', 'Admin', 'Team lead'), ('${memberId}', 'member-google', 'member@helixnmbu.no', 'Åse <Example>', 'Mechanical lead');
    insert into identity.member_roles values ('${adminId}', 'platform_administrator'), ('${memberId}', 'project_manager');`);
  const migration = readFileSync(new URL("../db/migrations/010_member_email_signature.sql", import.meta.url), "utf8");
  await pg.exec(migration);
  await pg.exec(migration);
  services = createEmailSignatureServices({
    db: { query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await pg.query<T>(sql, params)).rows }) },
    authenticate: async (token) => token === "admin"
      ? { userId: adminId, googleSub: "admin-google", email: "admin@helixnmbu.no", name: "Untrusted old name" }
      : { userId: memberId, googleSub: token === "mismatch" ? "wrong-google" : "member-google", email: "member@helixnmbu.no", name: "Stale name", helixRole: "Stale role" },
  });
});
beforeEach(async () => { await pg.exec("delete from member_mail.signature_settings"); });
afterAll(async () => { await pg.close(); });

describe("shared member signature", () => {
  it("starts disabled and prevents direct browser access", async () => {
    await expect(services.read("member")).resolves.toMatchObject({ revision: 0, settings: { enabled: false }, signature: { html: "", text: "" } });
    const privileges = await pg.query("select has_table_privilege('public', 'member_mail.signature_settings', 'SELECT') as public_read, has_table_privilege('authenticated', 'member_mail.signature_settings', 'UPDATE') as browser_write");
    expect(privileges.rows[0]).toEqual({ public_read: false, browser_write: false });
  });
  it("only permits platform administrators to change the signature", async () => {
    await expect(services.save("member", defaultSignatureSettings, 0)).rejects.toMatchObject({ status: 403 });
    await expect(services.read("mismatch")).rejects.toMatchObject({ status: 403 });
    await expect(services.save("mismatch", defaultSignatureSettings, 0)).rejects.toMatchObject({ status: 403 });
  });
  it("persists one template and renders current member profile data for everyone", async () => {
    const settings = { ...defaultSignatureSettings, enabled: true, logoUrl: "https://helixnmbu.no/logo.png", links: [{ label: "LinkedIn", url: "https://www.linkedin.com/company/helix-nmbu" }] };
    await expect(services.save("admin", settings, 0)).resolves.toMatchObject({ revision: 1, signature: { text: expect.stringContaining("Admin\nTeam lead") } });
    const result = await services.read("member");
    expect(result.revision).toBe(1);
    expect(result.signature.html).toContain("Åse &lt;Example&gt;");
    expect(result.signature.html).toContain("Mechanical lead");
    expect(result.signature.html).not.toContain("Stale");
    expect(result.signature.html).toContain('src="https://helixnmbu.no/logo.png"');
    expect(result.signature.html).toContain("LinkedIn");
    await expect(services.save("admin", { ...settings, enabled: false }, 0)).rejects.toMatchObject({ status: 409 });
    await services.save("admin", { ...settings, enabled: false }, 1);
    await expect(services.read("member")).resolves.toMatchObject({ revision: 2, signature: { html: "", text: "" } });
  });
  it("rejects invalid templates, color injection, and unsafe image or link URLs", () => {
    for (const patch of [
      { logoUrl: "javascript:alert(1)" },
      { logoUrl: "data:image/svg+xml,evil" },
      { linkColor: "red;background:url(evil)" },
      { lines: [{ text: "{member.password}", color: "#123456" }] },
      { links: [{ label: "Evil", url: "https://user:password@example.test" }] },
      { links: [{ label: "Evil", url: "http://example.test" }] },
    ]) expect(() => parseSignatureSettings({ ...defaultSignatureSettings, ...patch })).toThrow();
  });
  it("escapes member values and omits missing roles without recursive substitution", () => {
    const settings = { ...defaultSignatureSettings, enabled: true };
    const signature = renderSignature(settings, { name: '<img src="evil"> {member.email}', role: "", email: "ase@example.test" });
    expect(signature.html).toContain("&lt;img");
    expect(signature.html).not.toContain('<img src="evil">');
    expect(signature.text).toContain("{member.email}");
    expect(signature.text).not.toContain("\n\n");
  });
});
