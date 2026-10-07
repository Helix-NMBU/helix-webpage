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
      const respond = async (document: Awaited<ReturnType<CvServices["read"]>>) => {
        const result = envelope(document, identity);
        try { await services.cleanup(identity.userId); }
        catch { result.cleanupPending = true; }
        return res.status(200).json(result);
      };
      if (req.method === "GET") return respond(await services.read(identity.userId));
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
        return respond(saved);
      }
      const draft = parseData(body.draft, body.action === "publish");
      const sharing = parseSharing(body.sharing);
      if (body.action === "save") return respond(await services.commit(identity.userId, { action: "save", expectedRevision, draft, sharing }));
      let path: string | null = null;
      if (sharing.cv) {
        const bytes = await renderPdf(sharedCvData(draft, sharing), sharing);
        if (!bytes.length || bytes.length > 5242880) throw new MemberCvError(400, "The generated PDF must be smaller than 5 MB.");
        path = services.newPath(identity.userId);
        await services.prepareUpload(identity.userId, path, expectedRevision);
        try { await services.upload(path, bytes); }
        catch (error) {
          // A failed upload still has a durable candidate. Settlement prevents a
          // late publication from adopting bytes that cleanup will retire.
          try { await services.settleUpload(identity.userId, path, true); await services.cleanup(identity.userId); } catch { /* Retried from the durable candidate on a later request. */ }
          throw error;
        }
      }
      let saved;
      try { saved = await services.commit(identity.userId, { action: "publish", expectedRevision, draft, sharing, path }); }
      catch (error) {
        let current;
        try { current = await services.settleUpload(identity.userId, path); }
        catch { throw new MemberCvError(503, "The publication result could not be confirmed. Reload your CV before retrying. Its generated file remains tracked."); }
        const recovered = current.revision === expectedRevision + 1
          && current.publishedRevision === current.revision
          && current.publishedPath === path
          && JSON.stringify(validateCvData(current.draft)) === JSON.stringify(draft)
          && JSON.stringify(validateSharing(current.sharing)) === JSON.stringify(sharing);
        if (recovered) saved = current;
        else {
          try { await services.cleanup(identity.userId); } catch { /* Preserve queued cleanup without hiding the mutation error. */ }
          throw error;
        }
      }
      return respond(saved);
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
