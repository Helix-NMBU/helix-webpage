import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyNeonAuth, sendAuthProxyResponse } from "../_lib/auth-proxy.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function rawRequestBody(req: VercelRequest): Promise<Uint8Array | undefined> {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (!chunks.length) return undefined;
  return new Uint8Array(Buffer.concat(chunks));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const response = await proxyNeonAuth({
      method: req.method,
      rawUrl: req.url,
      headers: req.headers,
      body: await rawRequestBody(req),
      baseUrl: process.env.NEON_AUTH_BASE_URL,
      allowedHosts: process.env.AUTH_PROXY_ALLOWED_HOSTS,
    });
    await sendAuthProxyResponse(res, response);
  } catch (error) {
    console.error("Neon auth proxy failed to read the request.", error instanceof Error ? error.message : "read failed");
    res.setHeader("cache-control", "no-store");
    res.status(500).json({ error: "Member sign-in is temporarily unavailable. Try again." });
  }
}
