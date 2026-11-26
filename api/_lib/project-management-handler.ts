import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { neonProjectDependencies, neonProjectServices, type ProjectServices } from "./project-management-service.js";
import { createVehicleCatalogServices } from "./vehicle-catalog-service.js";

export function createProjectHandler(
  getServices: () => ProjectServices = neonProjectServices,
  getVehicleCatalogServices = () => createVehicleCatalogServices(neonProjectDependencies()),
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      const token = bearer(req.headers.authorization);
      const { view, projectId } = req.query ?? {};
      if (view === "vehicle-catalog" || view === "vehicle-scope") {
        if (req.method === "POST" && Number(req.headers["content-length"] ?? 0) > 10000) throw new MemberCvError(413, "This request is too large.");
        const catalog = getVehicleCatalogServices();
        const result = view === "vehicle-catalog"
          ? req.method === "GET" ? await catalog.load(token) : await catalog.save(token, req.body)
          : req.method === "GET" ? await catalog.loadProject(token, projectId) : await catalog.saveProject(token, projectId, req.body);
        return res.status(200).json(result);
      }
      if (req.method === "POST" && Number(req.headers["content-length"] ?? 0) > (req.body?.action === "save_project" ? 64000 : 20000)) throw new MemberCvError(413, "This request is too large.");
      const services = getServices();
      const result = req.method === "GET" ? await services.load(token) : await services.mutate(token, req.body);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(error instanceof MemberCvError ? error.status : 503).json({
        error: error instanceof MemberCvError ? error.message : "Project management is temporarily unavailable. Try again.",
      });
    }
  };
}
