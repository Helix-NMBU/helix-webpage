import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neonContactHandler } from "./_lib/contact-service.js";

export default function handler(req: VercelRequest, res: VercelResponse) {
  return neonContactHandler()(req, res);
}
