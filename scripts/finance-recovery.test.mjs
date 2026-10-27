import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { parseRecoveryArgs } from "./finance-recovery.mjs";

function run(args, env = {}) {
  return spawnSync(process.execPath, ["scripts/finance-recovery.mjs", ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("finance recovery operator script", () => {
  it("prints the retry bound without opening a connection", () => {
    expect(parseRecoveryArgs(["--dispatch"])).toEqual({ action: "dispatch", apply: false });
    const result = run(["--reconcile"], { DATABASE_URL: "postgres://invalid.example/should-not-connect" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("retry bound is 5");
    expect(result.stdout).toContain("Reconcile an unknown");
    expect(result.stdout).toContain("No database connection was opened.");
    expect(result.stdout).not.toContain("postgres://");
  });

  it("refuses to connect even when apply and a database URL are set", () => {
    const source = readFileSync(new URL("./finance-recovery.mjs", import.meta.url), "utf8");
    expect(source).not.toContain("from \"pg\"");
    expect(source).not.toContain("DATABASE_URL");
    const result = run(["--cleanup", "--apply"], { DATABASE_URL: "postgres://invalid.example/should-not-connect" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("not applied from this script");
    expect(result.stdout).toContain("No database connection was opened.");
  });

  it("rejects an unknown argument and a missing action", () => {
    expect(run(["--export"]).status).toBe(1);
    expect(run(["--apply"]).stderr).toContain("Choose dispatch, cleanup, or reconcile.");
  });
});