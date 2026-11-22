// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localFinanceProfileSelection } from "./local-finance-profile";
import { setLocalMemberSignedIn } from "./local-mode";
import { localMemberHasFinancials } from "./member-access-api";
import { createFinanceApi } from "../Finance/repository";

vi.mock("../MemberCV/session", () => ({ memberSessionToken: async () => "verified-real-session" }));

const select = (query = "") => window.history.replaceState({}, "", `/finance${query}`);
const values = () => Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
  const key = localStorage.key(index)!;
  return [key, localStorage.getItem(key)];
}));

beforeEach(() => {
  vi.stubEnv("DEV", true);
  vi.stubEnv("MODE", "member-local");
  localStorage.clear();
  select("?financeRole=reset");
  localFinanceProfileSelection();
  select();
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  select();
  vi.unstubAllEnvs();
});

describe("explicit local Finance profiles", () => {
  it.each(["finance", "head_of_finance"] as const)("selects %s without modifying saved access or directory roles", async profile => {
    const before = values();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    select(`?financeRole=${profile}`);
    expect(localFinanceProfileSelection()).toBe(profile);
    expect(localMemberHasFinancials()).toBe(true);
    const api = createFinanceApi({ current: null });
    const capabilities = await api.capabilities();
    expect(capabilities.profiles).toEqual([profile]);
    expect(capabilities.capabilities.purchaseRegister).toBe(true);
    expect(capabilities.capabilities.filesAndRefunds).toBe(true);
    expect(capabilities.capabilities.approveBudget).toBe(profile === "head_of_finance");
    expect(await api.recovery()).toMatchObject({ deliveries: [], uploads: [] });
    expect(values()).toEqual(before);
    expect(request).not.toHaveBeenCalled();
  });

  it("rechecks every selection and removes Head privileges and fixture access without persistence", async () => {
    const api = createFinanceApi({ current: null });
    select("?financeRole=head_of_finance");
    expect((await api.capabilities()).capabilities.approveBudget).toBe(true);
    select("?financeRole=finance");
    expect((await api.capabilities()).capabilities.approveBudget).toBe(false);
    select("?financeRole=reset&budgetRole=head_of_finance&fundingRole=head_of_finance");
    expect(localFinanceProfileSelection()).toBeNull();
    select("?budgetRole=head_of_finance&fundingRole=head_of_finance");
    expect(localFinanceProfileSelection()).toBeUndefined();
    expect(localMemberHasFinancials()).toBe(false);
    await expect(api.capabilities()).rejects.toMatchObject({ status: 403 });
    expect(localStorage.getItem("helix-member-local-space-access-v1")).not.toContain("financials");
    expect(localStorage.getItem("helix-funding-applications-local-role-v1")).toBeNull();
    expect(localStorage.getItem("helix-project-budgets-local-role-v1")).toBeNull();
  });

  it.each(["", "admin", "Admin", "financials", "department_lead", "partner", "HEAD_OF_FINANCE"])("refuses unknown explicit profile %s", async profile => {
    select(`?financeRole=${profile}`);
    expect(localFinanceProfileSelection()).toBeNull();
    expect(localMemberHasFinancials()).toBe(false);
    await expect(createFinanceApi({ current: null }).capabilities()).rejects.toMatchObject({ status: 403 });
    expect(values()).toEqual({});
  });

  it("keeps the selected profile through SPA links but clears it on reset, sign-out and module reload", async () => {
    select("?financeRole=head_of_finance");
    expect(localFinanceProfileSelection()).toBe("head_of_finance");
    select();
    expect(localFinanceProfileSelection()).toBe("head_of_finance");
    expect((await createFinanceApi({ current: null }).capabilities()).profiles).toEqual(["head_of_finance"]);
    setLocalMemberSignedIn(false);
    setLocalMemberSignedIn(true);
    expect(localFinanceProfileSelection()).toBeUndefined();
    expect(localMemberHasFinancials()).toBe(false);
    select("?financeRole=finance");
    expect(localFinanceProfileSelection()).toBe("finance");
    select();
    vi.resetModules();
    const fresh = await import("./local-finance-profile");
    expect(fresh.localFinanceProfileSelection()).toBeUndefined();
    expect(localStorage.getItem("helix-member-local-space-access-v1")).not.toContain("financials");
  });

  it("keeps ordinary saved local access unchanged when no profile is selected", () => {
    localStorage.setItem("helix-member-local-space-access-v1", JSON.stringify({ "00000000-0000-4000-8000-000000000001": ["financials"] }));
    localStorage.setItem("helix-member-local-partner-spaces-v1", "1");
    const before = values();
    expect(localFinanceProfileSelection()).toBeUndefined();
    expect(localMemberHasFinancials()).toBe(true);
    select("?financeRole=admin");
    expect(localMemberHasFinancials()).toBe(false);
    expect(values()).toEqual(before);
    select();
    expect(localMemberHasFinancials()).toBe(true);
    expect(values()).toEqual(before);
  });

  it("uses real API authorization outside development even when the URL selects Head of Finance", async () => {
    select("?financeRole=head_of_finance");
    vi.stubEnv("DEV", false);
    const request = vi.fn(async () => Response.json({ error: "Financials access is required." }, { status: 403 }));
    vi.stubGlobal("fetch", request);
    await expect(createFinanceApi({ current: null }).capabilities()).rejects.toMatchObject({ status: 403 });
    expect(request).toHaveBeenCalledWith("/api/finance?action=capabilities", expect.objectContaining({ headers: { Authorization: "Bearer verified-real-session" } }));
    expect(localMemberHasFinancials()).toBe(false);
    expect(values()).toEqual({});
  });

  it("refuses signed-out selection without fetching or granting local access", () => {
    select("?financeRole=head_of_finance");
    setLocalMemberSignedIn(false);
    const before = values();
    expect(localFinanceProfileSelection()).toBeNull();
    expect(localMemberHasFinancials()).toBe(false);
    expect(values()).toEqual(before);
  });

  it.each([{ dev: false, mode: "member-local" }, { dev: true, mode: "production" }, { dev: true, mode: "development" }])("cannot enable a profile outside the dedicated development mode: $dev/$mode", ({ dev, mode }) => {
    select("?financeRole=head_of_finance");
    vi.stubEnv("DEV", dev);
    vi.stubEnv("MODE", mode);
    expect(localFinanceProfileSelection()).toBeNull();
    expect(localMemberHasFinancials()).toBe(false);
    expect(values()).toEqual({});
  });

  it("clears an existing selection when ordinary access checks leave local mode", () => {
    select("?financeRole=head_of_finance");
    expect(localMemberHasFinancials()).toBe(true);
    select();
    vi.stubEnv("DEV", false);
    expect(localMemberHasFinancials()).toBe(false);
    vi.stubEnv("DEV", true);
    expect(localMemberHasFinancials()).toBe(false);
    expect(localFinanceProfileSelection()).toBeUndefined();
  });

  it("requires loopback even with a selected profile and signed-in development mode", () => {
    vi.stubGlobal("window", { location: { origin: "https://internal.helixnmbu.no", search: "?financeRole=head_of_finance" } });
    expect(localFinanceProfileSelection()).toBeNull();
    expect(localMemberHasFinancials()).toBe(false);
  });
});
