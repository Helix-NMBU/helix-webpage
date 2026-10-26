export type SponsorTier = "partner" | "service" | "bronze" | "silver" | "gold" | "platinum" | "main";

/** The server derives this context from the verified identity and current grants. */
export type SponsorContext = {
  authUserId: string;
  email: string;
  contactId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  role: "sponsor" | "developer" | "admin";
  portal: boolean;
  directory: boolean;
};
export type SponsorPrincipal = SponsorContext;
