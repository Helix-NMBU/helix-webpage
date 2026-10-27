import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createGmailCallbackHandler } from "./_lib/gmail-callback-handler.js";
import { createGmailConnectHandler } from "./_lib/gmail-connect-handler.js";
import { createGmailDisconnectHandler } from "./_lib/gmail-disconnect-handler.js";
import { createGmailMessageActionHandler, createGmailMessageHandler, createGmailMessagesHandler } from "./_lib/gmail-messages-handler.js";
import { createGmailStatusHandler } from "./_lib/gmail-status-handler.js";
import { createEmailSignatureHandler } from "./_lib/email-signature-handler.js";

const handlers = {
  callback: createGmailCallbackHandler(),
  connect: createGmailConnectHandler(),
  disconnect: createGmailDisconnectHandler(),
  status: createGmailStatusHandler(),
  messages: createGmailMessagesHandler(),
  message: createGmailMessageHandler(),
  messageAction: createGmailMessageActionHandler(),
  signature: createEmailSignatureHandler(),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = typeof req.query.action === "string" ? req.query.action : "";
  const selected = handlers[action as keyof typeof handlers];
  if (!selected) return res.status(404).json({ error: "Unknown Gmail action." });
  return selected(req, res);
}
