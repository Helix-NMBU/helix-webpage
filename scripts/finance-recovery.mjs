import { pathToFileURL } from "node:url";

const ACTIONS = new Set(["dispatch", "cleanup", "reconcile"]);

export function parseRecoveryArgs(argv) {
  const flags = new Set();
  for (const token of argv) {
    if (token === "--apply" || token === "--dispatch" || token === "--cleanup" || token === "--reconcile") {
      flags.add(token.slice(2));
      continue;
    }
    throw new Error("Unknown argument.");
  }
  const chosen = [...ACTIONS].filter((name) => flags.has(name));
  if (chosen.length !== 1) throw new Error("Choose dispatch, cleanup, or reconcile.");
  return { action: chosen[0], apply: flags.has("apply") };
}

function describe(action) {
  if (action === "dispatch") return "Notification delivery";
  if (action === "cleanup") return "Upload cleanup";
  return "Outcome reconciliation";
}

async function main() {
  let args;
  try { args = parseRecoveryArgs(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Could not read the recovery request.");
    process.exitCode = 1;
    return;
  }
  const lead = args.apply
    ? `${describe(args.action)} is not applied from this script.`
    : `${describe(args.action)} dry run only.`;
  console.log(`${lead} Run it from Finance tools while signed in with a finance or head profile. The retry bound is 5. Reconcile an unknown email or upload outcome before another attempt. No database connection was opened.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
