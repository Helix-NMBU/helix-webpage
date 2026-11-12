// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemberFeatureAccessProvider, useMemberFeatureAccess } from "./MemberFeatureAccess";
import { MEMBER_ACCESS_CHANGED } from "./member-access-api";

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("./MemberNotifications", () => ({ useNotify: () => notify }));
vi.mock("../MemberCV/session", () => ({
  memberSessionToken: async ({ current }: { current: string }) => `token-for-${current}`,
}));

const granted = { pipeline: true, agreements: true, financeReviews: true };
const denied = { pipeline: false, agreements: false, financeReviews: false };

function accessResponse(memberId: string, sponsorPages?: typeof granted) {
  return Response.json({ memberId, roles: [], features: [], sponsorPages });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const pending = new Promise<Response>(finish => { resolve = finish; });
  return { pending, resolve };
}

describe("member feature access refresh", () => {
  let root: Root;
  let value: ReturnType<typeof useMemberFeatureAccess>;
  let request: ReturnType<typeof vi.fn<typeof fetch>>;

  function Probe() {
    value = useMemberFeatureAccess();
    return null;
  }

  function render(userId: string) {
    root.render(<StrictMode><MemberFeatureAccessProvider userId={userId}><Probe /></MemberFeatureAccessProvider></StrictMode>);
  }

  beforeEach(() => {
    notify.mockReset();
    request = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", request);
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(document.createElement("div"));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it("coalesces focus refreshes and removes grants after the response changes", async () => {
    const refresh = deferredResponse();
    request.mockResolvedValueOnce(accessResponse("member", granted)).mockReturnValueOnce(refresh.pending);
    await act(async () => render("member"));
    expect(request).toHaveBeenCalledTimes(1);
    expect(value.member?.sponsorPages).toEqual(granted);

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("focus"));
    });
    expect(request).toHaveBeenCalledTimes(2);
    await act(async () => refresh.resolve(accessResponse("member", denied)));
    expect(value.member?.sponsorPages).toEqual(denied);
  });

  it("refreshes after an access change that occurs while a read is pending", async () => {
    const beforeChange = deferredResponse();
    request.mockReturnValueOnce(beforeChange.pending).mockResolvedValueOnce(accessResponse("member", denied));
    await act(async () => render("member"));
    await act(async () => window.dispatchEvent(new Event(MEMBER_ACCESS_CHANGED)));
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => beforeChange.resolve(accessResponse("member", granted)));
    expect(request).toHaveBeenCalledTimes(2);
    expect(value.member?.sponsorPages).toEqual(denied);
  });

  it("clears unavailable grants and retries via the shared notification", async () => {
    request
      .mockResolvedValueOnce(accessResponse("member", granted))
      .mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
      .mockResolvedValueOnce(accessResponse("member"));
    await act(async () => render("member"));
    expect(value.member?.sponsorPages).toEqual(granted);

    await act(async () => window.dispatchEvent(new Event(MEMBER_ACCESS_CHANGED)));
    expect(value.status).toBe("unavailable");
    expect(value.member).toBeNull();
    expect(notify).toHaveBeenCalledWith("Could not load platform access", "Please try again.", expect.objectContaining({
      action: expect.objectContaining({ label: "Try again" }),
    }));
    await act(async () => notify.mock.calls[0][2].action.onClick());
    expect(value.status).toBe("ready");
    expect(value.member?.sponsorPages).toEqual(denied);
  });

  it("drops previous account permissions and ignores its pending response", async () => {
    const oldRefresh = deferredResponse();
    const newAccount = deferredResponse();
    request
      .mockResolvedValueOnce(accessResponse("first", granted))
      .mockReturnValueOnce(oldRefresh.pending)
      .mockReturnValueOnce(newAccount.pending);
    await act(async () => render("first"));
    await act(async () => window.dispatchEvent(new Event("focus")));
    await act(async () => render("second"));
    expect(value.authUserId).toBe("second");
    expect(value.member).toBeNull();
    expect(request).toHaveBeenLastCalledWith("/api/member-access?action=self", expect.objectContaining({
      headers: { Authorization: "Bearer token-for-second" },
    }));

    await act(async () => newAccount.resolve(accessResponse("second", denied)));
    await act(async () => oldRefresh.resolve(accessResponse("first", granted)));
    expect(value.member?.memberId).toBe("second");
    expect(value.member?.sponsorPages).toEqual(denied);
  });
});
