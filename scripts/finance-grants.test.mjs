import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseGrantArgs } from "./finance-grants.mjs";

const operator = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";

function run(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/finance-grants.mjs", ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("finance grant operator script", () => {
  it("refuses a self-grant before any database connection", () => {
    expect(() => parseGrantArgs([
      "--operator", operator, "--member", operator, "--profile", "finance", "--grant", "--reason", "Coverage",
    ])).toThrow("Self-grant is not allowed.");
    const result = run([
      "--operator", operator, "--member", operator, "--profile", "finance", "--grant", "--reason", "Coverage", "--apply",
    ], { DATABASE_URL: "postgres://invalid.example/should-not-connect" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Self-grant is not allowed.");
    expect(result.stdout).not.toContain("granted");
  });

  it("dry-runs a valid grant without opening a connection", () => {
    const parsed = parseGrantArgs([
      "--operator", operator, "--member", member, "--profile", "business", "--revoke", "--reason", "Coverage check",
    ]);
    expect(parsed).toMatchObject({ operator, member, profile: "business", active: false, apply: false });
    const result = run([
      "--operator", operator, "--member", member, "--profile", "head_of_finance", "--grant", "--reason", "Coverage check",
    ], { DATABASE_URL: "postgres://invalid.example/should-not-connect" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("finance.set_member_grant");
    expect(result.stdout).toContain("active platform administrator");
    expect(result.stdout).toContain("No database connection was opened.");
  });

  it("rejects an unknown profile", () => {
    const result = run(["--operator", operator, "--member", member, "--profile", "administrator", "--grant", "--reason", "Coverage"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Invalid finance profile.");
  });
});
