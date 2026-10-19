import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMemberLoginHandler } from "../api/member-login.js";
import type { CvServices } from "../api/_lib/member-cv-service.js";
import { MemberCvError } from "../api/_lib/member-cv-error.js";

function fixture(authenticate: CvServices["authenticate"]) {
  const services = { authenticate } as CvServices;
  const handler = createMemberLoginHandler(() => services);
  async function request(authorization?: string, method = "POST") {
    let status: number | undefined;
    let result: unknown;
    const res = { setHeader: vi.fn(), status: (code: number) => { status = code; return res; }, json: (value: unknown) => { result = value; return res; } };
    await handler({ method, headers: { authorization }, body: { hd: "helixnmbu.no" } } as VercelRequest, res as unknown as VercelResponse);
    return { status, result };
  }
  return { authenticate, request };
}

describe("Neon member sign-in", () => {
  it("confirms a server-verified session and ignores a client hd hint", async () => {
    const f = fixture(vi.fn(async (token) => {
      expect(token).toBe("neon-session");
      return { userId: "member", googleSub: "google-ase", email: "ase@helixnmbu.no", name: "Åse" };
    }));
    expect(await f.request("Bearer neon-session")).toEqual({ status: 200, result: { ok: true, email: "ase@helixnmbu.no" } });
  });

  it("rejects a missing session before any profile write", async () => {
    const f = fixture(vi.fn());
    expect((await f.request()).status).toBe(401);
    expect(f.authenticate).not.toHaveBeenCalled();
  });

  it("returns the Workspace refusal from the server check", async () => {
    const f = fixture(vi.fn(async () => { throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account."); }));
    expect(await f.request("Bearer neon-session")).toEqual({ status: 403, result: { error: "Use your verified @helixnmbu.no Google Workspace account." } });
  });

  it("hides internal failures", async () => {
    const f = fixture(vi.fn(async () => { throw new Error("database password leaked"); }));
    expect(await f.request("Bearer neon-session")).toEqual({ status: 503, result: { error: "Member sign-in is temporarily unavailable. Try again." } });
  });

  it("rejects unsupported methods", async () => {
    const f = fixture(vi.fn());
    expect((await f.request("Bearer neon-session", "GET")).status).toBe(405);
    expect(f.authenticate).not.toHaveBeenCalled();
  });
});
