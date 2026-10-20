const WEAK_SSL_MODES = new Set(["require", "prefer", "verify-ca"]);

// pg treats require, prefer and verify-ca as verify-full and warns. Neon certs
// validate against the system CA store, so the string we pass can say so.
export function withVerifyFullSsl(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (!trimmed) return trimmed;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return trimmed;
    }
    const mode = url.searchParams.get("sslmode")?.toLowerCase();
    if (mode && WEAK_SSL_MODES.has(mode)) url.searchParams.set("sslmode", "verify-full");
    return url.toString();
  }
  return trimmed.replace(
    /(^|[\s?&])sslmode=(require|prefer|verify-ca)(?=$|[\s&])/gi,
    "$1sslmode=verify-full",
  );
}
