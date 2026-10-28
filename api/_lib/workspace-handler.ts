import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import {
  neonWorkspaceServices,
  type WorkspaceServices,
} from "./workspace-service.js";
import {
  neonDepartmentHomeServices,
  type DepartmentHomeServices,
} from "./department-home-service.js";
export function createWorkspaceHandler(
  getServices: () => WorkspaceServices = neonWorkspaceServices,
  getDepartmentServices: () => DepartmentHomeServices = neonDepartmentHomeServices,
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (!["GET", "POST"].includes(req.method ?? "")) {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const token = bearer(req.headers.authorization);
      if (Number(req.headers["content-length"] ?? 0) > (req.body?.action === "save_project" ? 64000 : 20000))
        throw new MemberCvError(413, "This request is too large.");
      if (req.method === "GET" && req.query?.department !== undefined)
        return res
          .status(200)
          .json(
            await getDepartmentServices().load(token, req.query.department),
          );
      if (
        req.method === "POST" &&
        req.body &&
        typeof req.body === "object" &&
        req.body.action === "save_department_home"
      )
        return res
          .status(200)
          .json(await getDepartmentServices().save(token, req.body));
      const services = getServices();
      return res
        .status(200)
        .json(
          req.method === "GET"
            ? await services.load(token)
            : await services.mutate(token, req.body),
        );
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : null;
      // Log only the database error class, never SQL, credentials, or member data.
      if (!(error instanceof MemberCvError)) console.error("Workspace request failed.", { code });
      const missingSchema = code === "42P01" || code === "42703" || code === "3F000";
      return res
        .status(error instanceof MemberCvError ? error.status : 503)
        .json({
          error:
            error instanceof MemberCvError
              ? error.message
              : missingSchema
                ? "Workspace setup is incomplete. Contact a platform administrator."
                : "Could not load workspace. Try again.",
        });
    }
  };
}
