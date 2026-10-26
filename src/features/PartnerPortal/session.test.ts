// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPartnerAuthClient, hasPartnerAuthSession, partnerSessionToken, sendPartnerOtp, signOutPartner, verifyPartnerOtp, watchPartnerAuthSession } from "./session";
import { sendNeonPartnerOtp } from "../../../api/_lib/partner-service";

let sequence = 0;
const authClient = () => createPartnerAuthClient(`https://partner-sdk-${++sequence}.example.test`);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("installed Neon SDK OTP and session contract", () => {
  it("sends OTP only through the backend invitation gate", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ message: "Generic response" }, { status: 202 }));
    await sendPartnerOtp(" Partner@Example.Test ", fetchImpl);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith("/api/partner?action=request-otp", {
      method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "partner@example.test" }),
    });
  });

  it("uses the installed SDK's server OTP-send path and payload without browser credentials", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchImpl);
    await sendNeonPartnerOtp("partner@example.test", "http://localhost:5190", "https://auth.example.test/neondb/auth");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://auth.example.test/neondb/auth/email-otp/send-verification-otp");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("origin")).toBe("http://localhost:5190");
    expect(JSON.parse(String(init.body))).toEqual({ email: "partner@example.test", type: "sign-in" });
  });

  it("verifies through the installed SDK without invoking any partner authorization endpoint", async () => {
    const fetchImpl = vi.fn(async () => Response.json({ token: "session-cookie-token", user: { id: "auth-user", email: "partner@example.test" } }));
    vi.stubGlobal("fetch", fetchImpl);
    await verifyPartnerOtp(" Partner@Example.Test ", " 123456 ", authClient());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toMatch(/\/api\/auth\/sign-in\/email-otp$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ email: "partner@example.test", otp: "123456" });
  });

  it.each([400, 401, 429, 500])("sanitizes SDK OTP errors and preserves status %s for recovery", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "secret provider details" }, { status })));
    await expect(verifyPartnerOtp("partner@example.test", "000000", authClient())).rejects.toMatchObject({
      status, message: "The code could not be verified. Check it or request a new code.",
    });
  });

  it("handles network failures and gate failures without exposing provider errors", async () => {
    await expect(sendPartnerOtp("partner@example.test", vi.fn(async () => { throw new Error("private host"); })))
      .rejects.toMatchObject({ status: 0, message: "Could not request a sign-in code. Try again shortly." });
    await expect(sendPartnerOtp("partner@example.test", vi.fn(async () => Response.json({ error: "private" }, { status: 503 }))))
      .rejects.toMatchObject({ status: 503, message: "Could not request a sign-in code. Try again shortly." });
  });

  it("force-fetches the session and bearer token, and handles missing/expired authentication", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => Response.json(String(url).endsWith("/token") ? { token: "fresh-jwt" } : { user: { id: "auth-user" } }));
    vi.stubGlobal("fetch", fetchImpl);
    const auth = authClient();
    expect(await hasPartnerAuthSession(auth)).toBe(true);
    expect(await partnerSessionToken(auth)).toBe("fresh-jwt");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    fetchImpl.mockImplementation(async () => Response.json({ message: "Expired" }, { status: 401 }));
    expect(await hasPartnerAuthSession(auth)).toBe(false);
    await expect(partnerSessionToken(auth)).rejects.toMatchObject({ status: 401 });
    fetchImpl.mockImplementation(async () => Response.json({}));
    await expect(partnerSessionToken(auth)).rejects.toMatchObject({ status: 401 });
  });

  it("reports session and sign-out outages so the UI can retry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: "private" }, { status: 503 })));
    await expect(hasPartnerAuthSession(authClient())).rejects.toMatchObject({ status: 503 });
    await expect(signOutPartner(authClient())).rejects.toMatchObject({ status: 503, message: "Could not sign out. Try again." });
  });

  it("invalidates on session refresh and unsubscribes from the installed SDK's session atom", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(null)));
    const auth = authClient();
    const invalidate = vi.fn();
    const reload = vi.fn();
    const stop = watchPartnerAuthSession(invalidate, reload, auth);
    expect(invalidate).toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalled();
    reload.mockClear();
    const refreshing = auth.useSession.get().refetch();
    expect(reload).not.toHaveBeenCalled();
    await refreshing;
    stop();
    invalidate.mockClear();
    await auth.useSession.get().refetch();
    expect(invalidate).not.toHaveBeenCalled();
    // Nanostores defers its on-unmount cleanup. Keep fetch mocked until the
    // SDK has stopped its refresh manager and aborted any pending query.
    await vi.advanceTimersByTimeAsync(1500);
    vi.useRealTimers();
  });
});
