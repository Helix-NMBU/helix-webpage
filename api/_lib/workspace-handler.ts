import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import {
  neonWorkspaceServices,
  type WorkspaceServices,
} from "./workspace-service.js";
export function createWorkspaceHandler(
  getServices: () => WorkspaceServices = neonWorkspaceServices,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "POST"].includes(req.method ?? "")) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const token = bearer(req.headers.authorization);
      if (Number(req.headers["content-length"] ?? 0) > 20000)
        throw new MemberCvError(413, "This request is too large.");
      const services = getServices();
      return res
        .status(200)
        .json(
          req.method === "GET"
            ? await services.load(token)
            : await services.mutate(token, req.body),
        );
    } catch (error) {
      return res
        .status(error instanceof MemberCvError ? error.status : 503)
        .json({
          error:
            error instanceof MemberCvError
              ? error.message
              : "Could not load workspace. Try again.",
        });
    }
  };
}
