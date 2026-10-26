import { resolve } from "node:path";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, it } from "vitest";
import { createSponsorDirectoryHandler } from "../api/_lib/sponsor-directory.js";
import { createSponsorAuthHandler } from "../api/_lib/sponsor-auth.js";
import { allowsSponsorLocalConfig, allowsSponsorLocalRequest, createSponsorLocalRuntime } from "./sponsor-local-plugin.js";

describe("local sponsor server boundaries", () => {
  it("requires serve, exact mode and explicit loopback binding", () => {
    expect(allowsSponsorLocalConfig("serve", "sponsor-local", "127.0.0.1")).toBe(true);
    for (const values of [["build", "sponsor-local", "127.0.0.1"], ["serve", "development", "127.0.0.1"], ["serve", "sponsor-local", "0.0.0.0"], ["serve", "sponsor-local", true], ["serve", "sponsor-local", undefined]] as const) {
      expect(allowsSponsorLocalConfig(values[0], values[1], values[2])).toBe(false);
    }
  });
  it.each([
    ["127.0.0.1:5192", "127.0.0.1", true], ["localhost:5192", "::1", true], ["[::1]:5192", "::ffff:127.0.0.1", true],
    ["127.0.0.1:5192", "192.168.1.2", false], ["attacker.invalid", "127.0.0.1", false],
    ["localhost.attacker.invalid", "127.0.0.1", false], ["attacker@localhost", "127.0.0.1", false],
    ["localhost/path", "127.0.0.1", false], [undefined, undefined, false],
  ])("validates Host %s and remote peer %s", (host, peer, expected) => {
    expect(allowsSponsorLocalRequest(host, peer)).toBe(expected);
  });
});

describe("real local SQL fixture runtime", () => {
  it("seeds publication boundaries, exercises actual access handlers and supplies generated PDFs", async () => {
    const runtime = await createSponsorLocalRuntime((deps) => {
      const auth = createSponsorAuthHandler(() => deps.access, { sendLink: deps.authSendLink });
      const directory = createSponsorDirectoryHandler(deps);
      return (req, res) => req.query.action === "session" ? auth(req, res) : directory(req, res);
    }, resolve("."));
    try {
      async function call(action: string, account = "sponsor", query: Record<string, string> = {}) {
        let status = 0; let body: unknown;
        const response = { setHeader() {}, status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; } };
        await runtime.handler({ method: "GET", query: { ...query, action }, headers: { authorization: `Bearer sponsor-local-${account}` } } as unknown as VercelRequest, response as unknown as VercelResponse);
        return { status, body: body as Record<string, unknown> };
      }
      expect((await call("session", "admin")).body.role).toBe("admin");
      expect((await call("session", "developer")).body.role).toBe("developer");
      for (const account of ["bronze", "admin", "developer", "expired", "unentitled", "unknown"]) expect((await call("directory", account)).status).not.toBe(200);
      const result = await call("directory");
      expect(result.status).toBe(200);
      const members = result.body.members as { id: string; fullName: string }[];
      expect(members).toHaveLength(2);
      expect(JSON.stringify(result.body)).not.toContain("Private edits");
      expect(JSON.stringify(result.body)).not.toContain("Withdrawn Example");
      const alex = members.find((item) => item.fullName === "Alex Example")!;
      expect(alex).toBeDefined();
      const pdf = await call("cv", "sponsor", { id: alex.id, disposition: "inline" });
      expect(pdf.status).toBe(200);
      const download = await runtime.download(new URL(String(pdf.body.url), "http://localhost").searchParams.get("grant")!);
      expect(download?.disposition).toBe("inline");
      expect(new TextDecoder().decode(download?.bytes.slice(0, 5))).toBe("%PDF-");
      expect(await runtime.download("not-a-grant")).toBeNull();
    } finally { await runtime.close(); }
  }, 30_000);
});
