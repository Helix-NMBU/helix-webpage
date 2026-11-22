/** Explicit production storage verification; never run as part of the normal build. */
import { build } from "esbuild";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (
  !process.argv.includes("--create-test-files") ||
  process.env.VERCEL_ENV !== "production"
) {
  console.error(
    "Requires --create-test-files and the authorized production identity.",
  );
  process.exit(1);
}
const root = dirname(dirname(fileURLToPath(import.meta.url)));
await mkdir(join(root, ".vercel"), { recursive: true });
const temporary = await mkdtemp(join(root, ".vercel/finance-drive-check-"));
try {
  const modulePath = join(temporary, "adapter.mjs");
  await build({
    entryPoints: [join(root, "api/_lib/finance-drive.ts")],
    outfile: modulePath,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
  const { createFinanceDrive } = await import(pathToFileURL(modulePath).href);
  const drive = createFinanceDrive();
  if (!drive) throw new Error("configuration_missing");
  await drive.validateDestination(
    drive.destination.driveId,
    drive.destination.folderId,
    Date.now() + 20_000,
  );
  const run = randomUUID();
  for (const byteSize of [1024, 10 * 1024 * 1024]) {
    const bytes = new Uint8Array(byteSize).fill(32);
    bytes.set(
      new TextEncoder().encode(
        "%PDF-1.4\n% HELIX STORAGE VERIFICATION ONLY - NOT AN INVOICE\n",
      ),
    );
    bytes.set(new TextEncoder().encode("\n%%EOF\n"), byteSize - 7);
    const source = {
      documentId: `storage-verification-${run}-${byteSize}`,
      fileId: await drive.generateId(Date.now() + 10_000),
      ...drive.destination,
      name: `HELIX-STORAGE-VERIFICATION-${run}-${byteSize}-NOT-AN-INVOICE.pdf`,
      contentType: "application/pdf",
      byteSize,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    console.log(
      JSON.stringify({
        verification: "test-file-allocated",
        fileId: source.fileId,
        name: source.name,
      }),
    );
    const uri = await drive.begin(source, Date.now() + 15_000);
    for (let offset = 0; offset < byteSize; offset += 1024 * 1024) {
      const end = Math.min(byteSize, offset + 1024 * 1024);
      const result = await drive.upload(
        uri,
        bytes.subarray(offset, end),
        offset,
        byteSize,
        Date.now() + 15_000,
      );
      if (
        result.expired ||
        result.confirmedBytes !== end ||
        result.done !== (end === byteSize)
      )
        throw new Error("verification_progress_mismatch");
    }
    const file = await drive.lookup(source.fileId, Date.now() + 10_000);
    if (!file) throw new Error("verification_file_missing");
    await drive.verify(source, file, Date.now() + 15_000);
    console.log(
      JSON.stringify({
        verification: "passed",
        fileId: source.fileId,
        byteSize,
        sha256: source.sha256,
        cleanup: "Move labelled file to Trash using authorized Drive account",
      }),
    );
  }
} catch (error) {
  console.error(
    JSON.stringify({
      verification: "failed",
      reason: error?.safeError ?? "storage_verification_failed",
    }),
  );
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
