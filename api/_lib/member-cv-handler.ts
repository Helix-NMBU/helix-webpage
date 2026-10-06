import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sharedCvData, validateCvData, validateSharing } from "../../src/features/MemberCV/model.js";
import type { CvMutation, PdfRenderer } from "../../src/features/MemberCV/types.js";
import { bearer, envelope, MemberCvError, supabaseCvServices, type CvServices } from "./member-cv-service.js";

export function createMemberCvHandler(renderPdf: PdfRenderer, getServices: () => CvServices = supabaseCvServices) {
  return async (req: VercelRequest, res: VercelResponse) => {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ error: "Method not allowed." });
    try {
      const token = bearer(req.headers.authorization);
      const services = getServices();
      const identity = await services.authenticate(token);
      await services.cleanup(identity.userId);
      if (req.method === "GET") return res.status(200).json(envelope(await services.read(identity.userId), identity));
      const body = parseMutation(req.body);
      if (body.action === "preview") {
        const draft = parseData(body.draft);
        const sharing = parseSharing(body.sharing);
        const bytes = await renderPdf(sharedCvData(draft, sharing), sharing);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", 'inline; filename="helix-cv.pdf"');
        return res.status(200).send(Buffer.from(bytes));
      }
      if (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 0) throw new MemberCvError(400, "A valid saved revision is required.");
      const expectedRevision = body.expectedRevision as number;
      if (body.action === "withdraw") {
        const saved = await services.commit(identity.userId, { action: "withdraw", expectedRevision });
        await services.cleanup(identity.userId);
        return res.status(200).json(envelope(saved, identity));
      }
      const draft = parseData(body.draft, body.action === "publish");
      const sharing = parseSharing(body.sharing);
      if (body.action === "save") return res.status(200).json(envelope(await services.commit(identity.userId, { action: "save", expectedRevision, draft, sharing }), identity));
      let path: string | null = null;
      if (sharing.cv) {
        const bytes = await renderPdf(sharedCvData(draft, sharing), sharing);
        if (!bytes.length || bytes.length > 5242880) throw new MemberCvError(400, "The generated PDF must be smaller than 5 MB.");
        path = services.newPath(identity.userId);
        await services.upload(path, bytes);
      }
      let saved;
      try { saved = await services.commit(identity.userId, { action: "publish", expectedRevision, draft, sharing, path }); }
      catch (error) {
        // A dropped RPC response can happen after PostgreSQL committed. Never
        // delete the new PDF until the publication outcome is reconciled.
        if (error instanceof MemberCvError && error.status === 409) {
          if (path) await services.remove(path);
          throw error;
        }
        let current;
        try { current = await services.read(identity.userId); }
        catch { throw new MemberCvError(503, "The publication result could not be confirmed. Reload your CV before retrying. The generated file has been preserved."); }
        const recovered = current.revision === expectedRevision + 1
          && current.publishedRevision === current.revision
          && current.publishedPath === path
          && JSON.stringify(validateCvData(current.draft)) === JSON.stringify(draft)
          && JSON.stringify(validateSharing(current.sharing)) === JSON.stringify(sharing);
        if (recovered) saved = current;
        else {
          // A newer draft can retain the PDF from this successful publication.
          // Leave any referenced path intact even when another edit won a race.
          if (path && current.publishedPath !== path) await services.remove(path);
          throw error;
        }
      }
      await services.cleanup(identity.userId);
      return res.status(200).json(envelope(saved, identity));
    } catch (error) {
      return res.status(error instanceof MemberCvError ? error.status : 503).json({ error: error instanceof MemberCvError ? error.message : "The member portal request failed. Your input has been kept. Try again." });
    }
  };
}
function parseMutation(value: unknown): CvMutation {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MemberCvError(400, "Invalid request.");
  const body = value as CvMutation;
  if (!["save", "publish", "withdraw", "preview"].includes(body.action) || JSON.stringify(value).length > 120000) throw new MemberCvError(400, "Invalid or oversized CV request.");
  return body;
}
function parseData(value: unknown, publication = false) {
  try { return validateCvData(value, publication); }
  catch (error) { throw new MemberCvError(400, error instanceof Error ? error.message : "Invalid CV data."); }
}
function parseSharing(value: unknown) {
  try { return validateSharing(value); }
  catch (error) { throw new MemberCvError(400, error instanceof Error ? error.message : "Invalid sharing choices."); }
}
