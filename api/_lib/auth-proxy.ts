import type { VercelRequest, VercelResponse } from "@vercel/node";

const PUBLIC_PREFIX = "/api/auth";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
// Apex and www are both first-party. Preview hosts are allowed by matching the request Host.
export const PRODUCTION_AUTH_HOSTS = ["helixnmbu.no", "www.helixnmbu.no"] as const;
const FORWARDED_REQUEST_HEADERS = [
  "user-agent",
  "authorization",
  "referer",
  "content-type",
  "origin",
  "x-neon-client-info",
] as const;

// Names set by neon-js (@neondatabase/auth) and Better Auth 1.7.
// Secure cookies use a __Secure- or __Host- prefix. PKCE lives inside oauth_state.
// Large session_data and account_data cookies may be split into numeric chunks.
const AUTH_COOKIE_PREFIXES = ["neon-auth.", "better-auth."] as const;
const AUTH_COOKIE_NAMES = new Set([
  "session_token",
  "session_data",
  "account_data",
  "dont_remember",
  "oauth_state",
  "state",
  "local.session_data",
  "session_challenge",
  "session_challange",
]);

export const NEON_AUTH_FORWARDED_COOKIES = [
  "__Secure-neon-auth.session_token",
  "__Secure-neon-auth.session_data",
  "__Secure-neon-auth.account_data",
  "__Secure-neon-auth.dont_remember",
  "__Secure-neon-auth.oauth_state",
  "__Secure-neon-auth.state",
  "__Secure-neon-auth.local.session_data",
  "__Secure-neon-auth.session_challenge",
  "__Secure-neon-auth.session_challange",
  "neon-auth.session_token",
  "neon-auth.session_data",
  "neon-auth.account_data",
  "neon-auth.dont_remember",
  "neon-auth.oauth_state",
  "neon-auth.state",
  "neon-auth.local.session_data",
  "neon-auth.session_challenge",
  "neon-auth.session_challange",
  "__Secure-better-auth.session_token",
  "__Secure-better-auth.session_data",
  "__Secure-better-auth.account_data",
  "__Secure-better-auth.dont_remember",
  "__Secure-better-auth.oauth_state",
  "__Secure-better-auth.state",
  "better-auth.session_token",
  "better-auth.session_data",
  "better-auth.account_data",
  "better-auth.dont_remember",
  "better-auth.oauth_state",
  "better-auth.state",
] as const;

export type AuthProxyRequest = {
  method?: string;
  rawUrl?: string;
  headers?: VercelRequest["headers"] | Headers;
  body?: unknown;
  baseUrl?: string;
  allowedHosts?: string;
  fetchImpl?: (input: string | URL, init?: RequestInit) => Promise<Response>;
};

function headerValue(headers: AuthProxyRequest["headers"], name: string): string | null {
  if (!headers) return null;
  if (headers instanceof Headers) return headers.get(name);
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target || value === undefined) continue;
    if (Array.isArray(value)) return target === "cookie" ? value.join("; ") : value.join(", ");
    return value;
  }
  return null;
}

export function isForwardedAuthCookie(name: string): boolean {
  let bare = name.trim();
  if (bare.startsWith("__Secure-")) bare = bare.slice("__Secure-".length);
  else if (bare.startsWith("__Host-")) bare = bare.slice("__Host-".length);
  const prefix = AUTH_COOKIE_PREFIXES.find((candidate) => bare.startsWith(candidate));
  if (!prefix) return false;
  const rest = bare.slice(prefix.length);
  if (AUTH_COOKIE_NAMES.has(rest)) return true;
  const chunk = /^(session_data|account_data)\.(\d+)$/.exec(rest);
  return Boolean(chunk && (chunk[2] === "0" || /^[1-9]\d*$/.test(chunk[2])));
}

export function forwardedAuthCookieHeader(cookieHeader: string | null): string {
  if (!cookieHeader) return "";
  const pairs: string[] = [];
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!isForwardedAuthCookie(name) || !value) continue;
    pairs.push(`${name}=${value}`);
  }
  return pairs.join("; ");
}

function splitRawUrl(rawUrl: string): { path: string; search: string } | null {
  const trimmed = rawUrl.trim();
  if (!trimmed || /[\r\n\0]/.test(trimmed) || trimmed.startsWith("//")) return null;
  let pathAndQuery = trimmed;
  const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.exec(trimmed);
  if (absolute) {
    const match = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)(\?[^#]*)?/i.exec(trimmed);
    if (!match) return null;
    pathAndQuery = `${match[1] || "/"}${match[2] || ""}`;
  }
  const hash = pathAndQuery.indexOf("#");
  if (hash !== -1) pathAndQuery = pathAndQuery.slice(0, hash);
  const query = pathAndQuery.indexOf("?");
  const path = query === -1 ? pathAndQuery : pathAndQuery.slice(0, query);
  const search = query === -1 ? "" : pathAndQuery.slice(query);
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return { path, search };
}

function hasEncodedSlash(value: string): boolean {
  return /%(?:25)*2f/i.test(value) || /%(?:25)*5c/i.test(value);
}

function segmentEscapes(segment: string): boolean {
  if (segment === ".." || segment.includes("\\") || segment.includes("/")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(segment) || segment.startsWith("//")) return true;
  let current = segment;
  for (let pass = 0; pass < 2; pass += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return true;
    }
    if (decoded === current) return false;
    if (
      decoded.split(/[/\\]/).includes("..")
      || decoded.includes("/")
      || decoded.includes("\\")
      || hasEncodedSlash(decoded)
      || /^[a-z][a-z0-9+.-]*:/i.test(decoded)
    ) return true;
    current = decoded;
  }
  return false;
}

export function isUnsafeAuthPath(path: string): boolean {
  if (path !== PUBLIC_PREFIX && !path.startsWith(`${PUBLIC_PREFIX}/`)) return true;
  if (path.includes("\\") || hasEncodedSlash(path)) return true;
  const remainder = path === PUBLIC_PREFIX ? "" : path.slice(PUBLIC_PREFIX.length + 1);
  if (remainder.startsWith("/") || remainder.startsWith("\\")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(remainder) || remainder.startsWith("//")) return true;
  return remainder.split("/").some(segmentEscapes);
}

function rawQueryParam(search: string, name: string): string | null {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (!query) return null;
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " "));
    } catch {
      return null;
    }
    if (key !== name) continue;
    return eq === -1 ? "" : part.slice(eq + 1);
  }
  return null;
}

function decodeQueryComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

function stripQueryParams(search: string, names: Set<string>): string {
  const query = search.startsWith("?") ? search.slice(1) : search;
  if (!query) return "";
  const kept: string[] = [];
  for (const part of query.split("&")) {
    if (!part) continue;
    const eq = part.indexOf("=");
    const rawKey = eq === -1 ? part : part.slice(0, eq);
    const key = decodeQueryComponent(rawKey);
    if (key && names.has(key)) continue;
    kept.push(part);
  }
  return kept.length ? `?${kept.join("&")}` : "";
}

// Vercel invokes api/auth.ts with the rewrite destination, not the browser path.
// `/api/auth/sign-in/social?foo=1` arrives as `/api/auth?__path=sign-in/social&path=sign-in/social&foo=1`.
export function resolveProxiedAuthUrl(rawUrl: string): { path: string; search: string } | null {
  const parts = splitRawUrl(rawUrl);
  if (!parts) return null;
  let path = parts.path;
  const rawProxyPath = rawQueryParam(parts.search, "__path");
  if ((path === PUBLIC_PREFIX || path === `${PUBLIC_PREFIX}/`) && rawProxyPath !== null) {
    const decoded = decodeQueryComponent(rawProxyPath);
    if (decoded === null) return null;
    // Vercel may already have decoded the rewrite once, so the encoded-slash
    // and double-decode checks have to see this value too, not only the raw query.
    const rawCandidate = rawProxyPath === "" ? PUBLIC_PREFIX : `${PUBLIC_PREFIX}/${rawProxyPath}`;
    const decodedCandidate = decoded === "" ? PUBLIC_PREFIX : `${PUBLIC_PREFIX}/${decoded}`;
    if (isUnsafeAuthPath(rawCandidate) || isUnsafeAuthPath(decodedCandidate)) return null;
    path = decodedCandidate;
  }
  if (isUnsafeAuthPath(path)) return null;
  return { path, search: stripQueryParams(parts.search, new Set(["__path", "path"])) };
}

function upstreamUrl(baseUrl: string, rawUrl: string): URL | null {
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return null;
  }
  if (base.protocol !== "https:" && base.protocol !== "http:") return null;
  if (base.username || base.password) return null;
  const parts = resolveProxiedAuthUrl(rawUrl);
  if (!parts) return null;
  const basePath = base.pathname.replace(/\/$/, "");
  const suffix = parts.path === PUBLIC_PREFIX || parts.path === `${PUBLIC_PREFIX}/`
    ? ""
    : parts.path.slice(PUBLIC_PREFIX.length + 1);
  let upstream: URL;
  try {
    upstream = new URL(`${base.origin}${basePath}${suffix ? `/${suffix}` : ""}${parts.search}`);
  } catch {
    return null;
  }
  if (upstream.origin !== base.origin) return null;
  if (upstream.pathname !== basePath && !upstream.pathname.startsWith(`${basePath}/`)) return null;
  return upstream;
}

export function rewriteAuthSetCookie(cookie: string, authPath: string): string {
  const base = authPath.replace(/\/$/, "") || "/";
  const withoutDomain = cookie.replace(/;\s*domain\s*=\s*[^;]*/gi, "");
  return withoutDomain.replace(/;\s*path\s*=\s*("?)([^";]*)\1/gi, (full, quote: string, value: string) => {
    const path = value.trim();
    if (path !== base && !path.startsWith(`${base}/`)) return full;
    return `; Path=${quote}/api/auth${path.slice(base.length)}${quote}`;
  });
}

export function rewriteAuthLocation(location: string, baseUrl: string): string {
  let base: URL;
  let target: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(location, base);
  } catch {
    return location;
  }
  if (target.origin !== base.origin) return location;
  const basePath = base.pathname.replace(/\/$/, "");
  if (target.pathname !== basePath && !target.pathname.startsWith(`${basePath}/`)) return location;
  const suffix = target.pathname.slice(basePath.length);
  return `/api/auth${suffix}${target.search}${target.hash}`;
}

function normalizeHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!host || /[\s,/\\]/.test(host)) return null;
  return host;
}

function allowedAuthHosts(requestHost: string | null, extra: string | undefined): Set<string> {
  const hosts = new Set<string>(PRODUCTION_AUTH_HOSTS);
  const current = normalizeHost(requestHost);
  if (current) hosts.add(current);
  for (const part of extra?.split(",") ?? []) {
    const host = normalizeHost(part);
    if (host) hosts.add(host);
  }
  return hosts;
}

function originHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return normalizeHost(url.host);
  } catch {
    return null;
  }
}

// State-changing requests must come from this site. The browser Origin is
// forwarded afterwards; Neon trusts the branch alias and the production domains.
export function allowsAuthStateChange(input: {
  method: string;
  headers?: AuthProxyRequest["headers"];
  allowedHosts?: string;
}): boolean {
  if (SAFE_METHODS.has(input.method)) return true;
  const origin = headerValue(input.headers, "origin")?.trim() ?? "";
  const fetchSite = headerValue(input.headers, "sec-fetch-site")?.trim().toLowerCase() ?? "";
  if (!origin && !fetchSite) return false;
  if (origin) {
    const host = originHost(origin);
    if (!host) return false;
    return allowedAuthHosts(headerValue(input.headers, "host"), input.allowedHosts).has(host);
  }
  return fetchSite === "same-origin";
}

function requestBody(method: string, body: unknown): BodyInit | undefined {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return undefined;
  if (typeof body === "string") return body;
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) return new Uint8Array(body);
  return undefined;
}

function jsonResponse(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

export async function proxyNeonAuth(input: AuthProxyRequest): Promise<Response> {
  const baseUrl = input.baseUrl?.trim();
  if (!baseUrl) {
    console.error("Neon auth proxy is missing NEON_AUTH_BASE_URL.");
    return jsonResponse(500, "Member sign-in is temporarily unavailable. Try again.");
  }
  const rawUrl = input.rawUrl ?? "/";
  const target = upstreamUrl(baseUrl, rawUrl);
  if (!target) return jsonResponse(400, "Invalid auth path.");
  const method = (input.method ?? "GET").toUpperCase();
  if (!allowsAuthStateChange({ method, headers: input.headers, allowedHosts: input.allowedHosts })) {
    console.error("Rejected a cross-site Neon auth request.");
    return jsonResponse(403, "Cross-site request was rejected.");
  }
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = headerValue(input.headers, name);
    if (value) headers.set(name, value);
  }
  const cookies = forwardedAuthCookieHeader(headerValue(input.headers, "cookie"));
  if (cookies) headers.set("cookie", cookies);
  try {
    const upstream = await (input.fetchImpl ?? fetch)(target, {
      method,
      headers,
      body: requestBody(method, input.body),
      redirect: "manual",
    });
    const responseHeaders = new Headers();
    responseHeaders.set("cache-control", "no-store");
    const contentType = upstream.headers.get("content-type");
    if (contentType) responseHeaders.set("content-type", contentType);
    for (const name of ["set-auth-jwt", "set-auth-token"]) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    const location = upstream.headers.get("location");
    if (location) responseHeaders.set("location", rewriteAuthLocation(location, baseUrl));
    const authPath = new URL(baseUrl).pathname;
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", rewriteAuthSetCookie(cookie, authPath));
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("Neon auth proxy request failed.", error instanceof Error ? error.message : "fetch failed");
    return jsonResponse(502, "Member sign-in is temporarily unavailable. Try again.");
  }
}

export async function sendAuthProxyResponse(res: VercelResponse, response: Response): Promise<void> {
  res.status(response.status);
  const cookies = response.headers.getSetCookie();
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    res.setHeader(key, value);
  });
  if (cookies.length === 1) res.setHeader("set-cookie", cookies[0]);
  else if (cookies.length > 1) res.setHeader("set-cookie", cookies);
  res.send(Buffer.from(await response.arrayBuffer()));
}
