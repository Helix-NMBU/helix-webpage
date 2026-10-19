import type { VercelRequest, VercelResponse } from "@vercel/node";
import { proxyNeonAuth, sendAuthProxyResponse } from "../_lib/auth-proxy.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const response = await proxyNeonAuth({
    method: req.method,
    rawUrl: req.url,
    headers: req.headers,
    body: req.body,
    baseUrl: process.env.NEON_AUTH_BASE_URL,
  });
  await sendAuthProxyResponse(res, response);
}
