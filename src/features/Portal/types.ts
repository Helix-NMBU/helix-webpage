export type SponsorTier = "Main" | "Gold" | "Silver" | "Bronze" | "Service";

export type PortalContext = {
  userId: string;
  email: string;
  isMember: boolean;
  isAdmin: boolean;
  sponsorContactId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationLogoUrl: string | null;
  tier: SponsorTier | null;
  agreementId: string | null;
  agreementEndsAt: string | null;
  talentDirectory: boolean;
  thesisCredits: number | null;
};

export type PortalResource = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  expires_at: string | null;
};

export type SponsorRequest = {
  id: string;
  created_at: string;
  subject: string;
  category: string;
  description: string;
  status: "submitted" | "in_progress" | "waiting_for_sponsor" | "completed";
};

export type MemberOpportunity = {
  id: string;
  organization_id?: string;
  created_at: string;
  kind: "thesis" | "job" | "project_challenge";
  title: string;
  summary: string;
  description: string;
  fields: string[];
  location: string | null;
  starts_at: string | null;
  deadline: string | null;
  compensation: string | null;
  confidentiality: string | null;
  intellectual_property: string | null;
  status: "draft" | "submitted" | "under_review" | "changes_requested" | "approved" | "published" | "closed";
  sponsor_organizations?: { name: string } | null;
};

export type HelixEngagement = {
  id: string;
  created_at: string;
  kind: "talent_introduction" | "recruitment_event" | "technical_workshop";
  title: string;
  description: string;
  status: "requested" | "quoting" | "approved" | "scheduled" | "in_progress" | "fulfilled" | "cancelled";
  preferred_dates: string | null;
  location: string | null;
  audience: string | null;
  budget: string | null;
  quote_amount: number | null;
  quote_currency: string | null;
};
