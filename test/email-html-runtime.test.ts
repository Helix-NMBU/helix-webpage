import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("email sanitizer deployment runtime", () => {
  it("loads and sanitizes with synchronous require of ESM disabled", () => {
    // Vercel's instrumented CommonJS loader cannot synchronously require the
    // ESM-only htmlparser2. Exercise the same bundled module as the API.
    const result = execFileSync(process.execPath, [
      "--no-experimental-require-module",
      "--input-type=module",
      "-e",
      `import sanitize from './api/_lib/generated/email-sanitizer.mjs'; process.stdout.write(sanitize('<p>Hello <strong>member</strong></p><script>bad()</script>'));`,
    ], { cwd: process.cwd(), encoding: "utf8" });
    expect(result).toBe("<p>Hello <strong>member</strong></p>");
  });
});
