import type { VercelRequest, VercelResponse } from "@vercel/node";
import { bearer } from "./member-cv-service.js";
import { MemberCvError } from "./member-cv-error.js";
import { DuplicateFundingError, FundingMismatchError, neonDealServices, type DealServices } from "./partner-deals-service.js";
export function createDealHandler(getServices: () => DealServices = neonDealServices) {
 return async (req: VercelRequest, res: VercelResponse) => {
  res.setHeader("Cache-Control", "private, no-store"); res.setHeader("Vary", "Authorization");
  if (req.method !== "GET" && req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed." }); }
  try {
   const token = bearer(req.headers.authorization); const service = getServices();
   if (req.method === "GET") {
    if (req.query.view === "financeReviews") return res.status(200).json(await service.financeReviewQueue(token));
    if (req.query.view === "reviewNotifications") return res.status(200).json(await service.reviewNotifications(token));
    if (req.query.view === "taskDeal") return res.status(200).json(await service.taskDeal(token,req.query.taskId));
    if (req.query.view === "fundingCandidates") return res.status(200).json(await service.fundingCandidates(token,req.query.contributionId));
    if (req.query.view !== "pipeline" && req.query.view !== "shared") throw new MemberCvError(400,"Choose a valid deal view.");
    return res.status(200).json(await service.load(token,req.query.view));
   }
   if (Number(req.headers["content-length"] ?? 0) > 64000) throw new MemberCvError(413,"This request is too large.");
   if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) throw new MemberCvError(400,"Check the deal details and try again.");
   if (req.body.action === "markReviewNotificationsRead") return res.status(200).json(await service.markReviewNotificationsRead(token,req.body.ids));
   if (req.body.action === "recordAgreementChange") return res.status(200).json(await service.recordAgreementChange(token,req.body.dealId,req.body.expectedRevision,req.body.kind,req.body.reason,req.body.terms,req.body.confirmed));
   if (req.body.action === "resolveAgreementChange") return res.status(200).json(await service.resolveAgreementChange(token,req.body.changeId,req.body.note,req.body.confirmed,req.body.manualConfirmed));
   if (req.body.action === "withdrawAgreementChange") return res.status(200).json(await service.withdrawAgreementChange(token,req.body.changeId,req.body.note,req.body.confirmed));
   if (req.body.action === "acknowledgeManualFunding") return res.status(200).json(await service.acknowledgeManualFunding(token,req.body.dealId,req.body.expectedRevision,req.body.contributionId,req.body.reviewToken,req.body.note,req.body.confirmed));
   if (req.body.action === "requestFinanceReview") return res.status(200).json(await service.requestFinanceReview(token,req.body.dealId,req.body.expectedRevision));
   if (req.body.action === "resolveFinanceReview") return res.status(200).json(await service.resolveFinanceReview(token,req.body.reviewId,req.body.resolution,req.body.fundingId,req.body.expectedRevision,req.body.snapshot,req.body.confirmed));
   if (req.body.action === "createOrganization") return res.status(200).json(await service.createOrganization(token,req.body.name));
   if (req.body.action === "renameOrganization") return res.status(200).json(await service.renameOrganization(token,req.body.id,req.body.expectedRevision,req.body.name));
   if (req.body.action === "approveSeparateFunding") return res.status(200).json(await service.approveSeparateFunding(token,req.body.contributionId,req.body.snapshot,req.body.confirmed));
   if (req.body.action === "linkFunding") return res.status(200).json(await service.linkFunding(token,req.body.contributionId,req.body.fundingId,req.body.expectedRevision));
   if (req.body.action === "unlinkFunding") return res.status(200).json(await service.unlinkFunding(token,req.body.contributionId));
   if (req.body.action === "confirmWon") return res.status(200).json(await service.confirmWon(token,req.body.dealId,req.body.expectedRevision,req.body.confirmed));
   if (req.body.action === "saveDeal") return res.status(200).json(await service.save(token,req.body.deal));
   throw new MemberCvError(400,"Choose a valid deal operation.");
  } catch (error) {
   return res.status(error instanceof MemberCvError ? error.status : 503).json({ error: error instanceof MemberCvError ? error.message : "Sponsor deals are temporarily unavailable. Try again.", ...((error instanceof DuplicateFundingError || error instanceof FundingMismatchError) ? { code: error.code } : {}) });
  }
 };
}
