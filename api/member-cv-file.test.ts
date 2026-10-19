import { describe, expect, it, vi } from "vitest";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createMemberCvFileHandler } from "./member-cv-file.js";
import { MemberCvError, type CvServices } from "./_lib/member-cv-service.js";

const userId = "cfccf73f-0043-4a02-86c8-e86d4d2f02fd";

function response() {
  let status = 0;
  let body: unknown;
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((key: string, value: string) => { headers[key] = value; }),
    status: vi.fn((code: number) => { status = code; return res; }),
    json: vi.fn((value: unknown) => { body = value; return res; }),
  };
  return { res: res as unknown as VercelResponse, result: () => ({ status, body, headers }) };
}

function handler(authenticate: CvServices["authenticate"], presignDownload: CvServices["presignDownload"]) {
  const services = { authenticate, presignDownload } as CvServices;
  return createMemberCvFileHandler(() => services);
}

async function call(
  authenticate: CvServices["authenticate"],
  presignDownload: CvServices["presignDownload"],
  authorization?: string,
) {
  const res = response();
  await handler(authenticate, presignDownload)(
    { method: "GET", headers: authorization === undefined ? {} : { authorization } } as VercelRequest,
    res.res,
  );
  return res.result();
}

describe("GET /api/member-cv-file", () => {
  const presign = vi.fn(async () => ({ url: "https://storage.example/signed", expiresIn: 120 }));
  const authenticate = vi.fn(async (token: string) => {
    if (token !== "member-token") throw new MemberCvError(401, "Your session has expired. Log in again.");
    return { userId, googleSub: "google-sub", email: "ase@helixnmbu.no", name: "Åse" };
  });

  it("returns 401 when the caller has no session", async () => {
    const missing = await call(authenticate, presign);
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: "Log in to continue." });
    expect(missing.headers["Cache-Control"]).toBe("no-store");
    expect(authenticate).not.toHaveBeenCalled();
    const rejected = await call(authenticate, presign, "Bearer expired");
    expect(rejected.status).toBe(401);
    expect(rejected.body).toEqual({ error: "Your session has expired. Log in again." });
    expect(presign).not.toHaveBeenCalled();
  });

  it("returns 404 when the member has no published PDF", async () => {
    const result = await call(
      authenticate,
      vi.fn(async () => { throw new MemberCvError(404, "No published CV is available to download."); }),
      "Bearer member-token",
    );
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: "No published CV is available to download." });
  });

  it("returns the signed-in member's presigned download", async () => {
    const result = await call(authenticate, presign, "Bearer member-token");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ url: "https://storage.example/signed", expiresIn: 120 });
    expect(presign).toHaveBeenCalledWith(userId);
  });
});
