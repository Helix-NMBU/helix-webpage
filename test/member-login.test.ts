import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMemberLoginHandler } from "../api/member-login.js";
import type { CvServices } from "../api/_lib/member-cv-service.js";
import { MemberCvError } from "../api/_lib/member-cv-error.js";

function fixture(authenticate: CvServices["authenticate"]) {
  const services = { authenticate } as CvServices;
  const handler = createMemberLoginHandler(() => services);
  async function request(headers: Record<string, string> = {}, method = "POST") {
    let status: number | undefined;
    let result: unknown;
    const res = { setHeader: vi.fn(), status: (code: number) => { status = code; return res; }, json: (value: unknown) => { result = value; return res; } };
    await handler({ method, headers, body: { hd: "helixnmbu.no" } } as VercelRequest, res as unknown as VercelResponse);
    return { status, result };
  }
  return { authenticate, request };
}

function loggedFailures() {
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  return logged;
}

describe("Neon member sign-in", () => {
  it("confirms a server-verified session and ignores a client hd hint", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn(async (token) => {
      expect(token).toBe("neon-session");
      return { userId: "member", googleSub: "google-ase", email: "ase@helixnmbu.no", name: "Åse" };
    }));
    expect(await f.request({ authorization: "Bearer neon-session" })).toEqual({ status: 200, result: { ok: true, email: "ase@helixnmbu.no" } });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });

  it("returns 401 and logs no_session_cookie when the request has no bearer token", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn());
    expect(await f.request({ cookie: "__Secure-neon-auth.session_token=present" })).toEqual({ status: 401, result: { error: "Log in to continue." } });
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", { reason: "no_session_cookie", status: 401 });
    logged.mockRestore();
  });

  it("logs session_lookup_failed when the bearer token is rejected", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn(async () => { throw new MemberCvError(401, "Your session has expired. Log in again."); }));
    expect(await f.request({ authorization: "Bearer expired" })).toEqual({ status: 401, result: { error: "Your session has expired. Log in again." } });
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", { reason: "session_lookup_failed", status: 401 });
    logged.mockRestore();
  });

  it("logs missing_env when authentication reports missing configuration", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn(async () => { throw new MemberCvError(503, "Member portal server configuration is missing."); }));
    expect(await f.request({ authorization: "Bearer neon-session" })).toEqual({ status: 503, result: { error: "Member portal server configuration is missing." } });
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", { reason: "missing_env", status: 503 });
    logged.mockRestore();
  });

  it("returns the Workspace refusal from the server check", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn(async () => { throw new MemberCvError(403, "Use your verified @helixnmbu.no Google Workspace account."); }));
    expect(await f.request({ authorization: "Bearer neon-session" })).toEqual({ status: 403, result: { error: "Use your verified @helixnmbu.no Google Workspace account." } });
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", { reason: "domain_rejected", status: 403 });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("@");
    logged.mockRestore();
  });

  it("hides internal failures", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn(async () => { throw new Error("database password leaked"); }));
    expect(await f.request({ authorization: "Bearer neon-session" })).toEqual({ status: 503, result: { error: "Member sign-in is temporarily unavailable. Try again." } });
    expect(logged).toHaveBeenCalledWith("Member session bootstrap failed.", { reason: "db_error", status: 503 });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("password");
    logged.mockRestore();
  });

  it("rejects unsupported methods", async () => {
    const logged = loggedFailures();
    const f = fixture(vi.fn());
    expect((await f.request({ authorization: "Bearer neon-session" }, "GET")).status).toBe(405);
    expect(f.authenticate).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
