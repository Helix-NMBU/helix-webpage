import type { MemberAccount } from "../../src/features/MemberPlatform/account.js";
import type { WorkspaceIdentity } from "./member-cv-service.js";

// Initial workspace role assignment, based only on the server-verified account.
const ADMIN_EMAILS = new Set(["henrik.engdal@helixnmbu.no"]);

export function memberAccount(identity: WorkspaceIdentity): MemberAccount {
  const email = identity.email.trim().toLowerCase();
  return {
    name: identity.name.trim() || email,
    email,
    role: ADMIN_EMAILS.has(email) ? "Admin" : "Member",
  };
}
