import { pathToFileURL } from "node:url";

const PROFILES = new Set(["business", "finance", "head_of_finance"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseGrantArgs(argv) {
  const values = new Map();
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply" || token === "--grant" || token === "--revoke") {
      flags.add(token.slice(2));
      continue;
    }
    if (!token.startsWith("--")) throw new Error("Unknown argument.");
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error("Missing argument value.");
    values.set(token.slice(2), value);
    index += 1;
  }
  const operator = values.get("operator");
  const member = values.get("member");
  const profile = values.get("profile");
  const reason = values.get("reason");
  if (!operator || !member || !profile || !reason) throw new Error("Operator, member, profile, and reason are required.");
  if (!UUID.test(operator) || !UUID.test(member)) throw new Error("Operator and member must be member ids.");
  if (operator === member) throw new Error("Self-grant is not allowed.");
  if (!PROFILES.has(profile)) throw new Error("Invalid finance profile.");
  const trimmed = reason.trim();
  if (!trimmed || trimmed.length > 500 || trimmed.includes("\u0000")) throw new Error("A grant reason is required.");
  if (flags.has("grant") === flags.has("revoke")) throw new Error("Choose either grant or revoke.");
  return { operator, member, profile, reason: trimmed, active: flags.has("grant"), apply: flags.has("apply") };
}

async function main() {
  let args;
  try { args = parseGrantArgs(process.argv.slice(2)); }
  catch (error) {
    console.error(error instanceof Error ? error.message : "Could not read the grant request.");
    process.exitCode = 1;
    return;
  }
  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to call finance.set_member_grant. The operator must be an active platform administrator. No database connection was opened.");
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.error("Set DATABASE_URL before applying a finance grant.");
    process.exitCode = 1;
    return;
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    await client.query("select finance.set_member_grant($1::uuid, $2::uuid, $3::text, $4::boolean, $5::text)", [
      args.operator, args.member, args.profile, args.active, args.reason,
    ]);
    console.log(args.active ? "Finance profile granted." : "Finance profile revoked.");
  } catch {
    console.error("The finance grant change was not saved.");
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
