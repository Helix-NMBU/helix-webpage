import type { HelixEngagement, MemberOpportunity, PortalContext, PortalResource, SponsorRequest } from "./types";

export const previewContext: PortalContext = {
  userId: "preview-user",
  email: "sponsor@example.no",
  isMember: false,
  isAdmin: false,
  sponsorContactId: "preview-contact",
  organizationId: "preview-organization",
  organizationName: "3Dconnexion",
  organizationLogoUrl: "/sponsor_logos/3DConnexion_logo.png",
  tier: "Gold",
  agreementId: "preview-agreement",
  agreementEndsAt: "2027-06-30",
  talentDirectory: true,
  thesisCredits: 1,
};

export const previewResources: PortalResource[] = [
  { id: "resource-1", title: "Helix brand package", description: "Logos, colors, and guidance for partnership announcements.", url: "#", expires_at: null },
  { id: "resource-2", title: "Partnership agreement", description: "A copy of the current Gold sponsorship agreement.", url: "#", expires_at: "2027-06-30" },
];

export const previewRequests: SponsorRequest[] = [
  { id: "request-1", created_at: "2026-09-18T09:00:00Z", subject: "Company visit in October", category: "Event or workshop", description: "Plan a company visit for interested members.", status: "in_progress" },
  { id: "request-2", created_at: "2026-09-03T12:00:00Z", subject: "Logo for recruitment post", category: "Brand and media", description: "Confirm the correct Helix logo for our recruitment post.", status: "completed" },
];

export const previewOpportunities: MemberOpportunity[] = [
  { id: "opportunity-1", organization_id: "preview-organization", created_at: "2026-09-14T10:00:00Z", kind: "thesis", title: "Autonomous inspection in harsh environments", summary: "Develop and test a perception concept for industrial inspection.", description: "The student will evaluate sensors and build a small proof of concept.", fields: ["Autonomy", "Computer vision"], location: "Ås and Oslo", starts_at: "2027-01-10", deadline: "2026-11-15", compensation: "To be agreed", confidentiality: "A separate agreement may apply to company data.", intellectual_property: "Terms will be agreed before work begins.", status: "published" },
  { id: "opportunity-2", organization_id: "preview-organization", created_at: "2026-09-20T08:30:00Z", kind: "job", title: "Graduate mechanical engineer", summary: "Join the product team after graduation.", description: "Work with mechanical design, testing, and supplier follow-up.", fields: ["Mechanical engineering"], location: "Oslo", starts_at: null, deadline: "2026-12-01", compensation: null, confidentiality: null, intellectual_property: null, status: "under_review" },
];

export const previewEngagements: HelixEngagement[] = [
  { id: "engagement-1", created_at: "2026-09-19T11:00:00Z", kind: "technical_workshop", title: "Design review workshop", description: "A practical evening workshop led by two engineers.", status: "quoting", preferred_dates: "22 or 29 October", location: "Helix workshop", audience: "Mechanical and autonomous members", budget: "NOK 15,000", quote_amount: 12000, quote_currency: "NOK" },
];

export const previewMembers = [
  { id: "member-1", full_name: "Ingrid Hansen", email: "ingrid@example.no", personal_email: null, personal_phone: null, linkedin: "https://www.linkedin.com", field_of_study: "Mechanical engineering", graduation_year: 2027, profile_image_url: null, cv_url: "preview/ingrid-hansen.pdf", share_cv: true, share_email: true, share_phone: false },
  { id: "member-2", full_name: "Sander Berg", email: null, personal_email: null, personal_phone: null, linkedin: "https://www.linkedin.com", field_of_study: "Robotics and control", graduation_year: 2026, profile_image_url: null, cv_url: null, share_cv: false, share_email: false, share_phone: false },
  { id: "member-3", full_name: "Mina Solheim", email: "mina@example.no", personal_email: null, personal_phone: null, linkedin: "https://www.linkedin.com", field_of_study: "Data science", graduation_year: 2028, profile_image_url: null, cv_url: null, share_cv: false, share_email: true, share_phone: false },
];

export const previewResponses = [
  { id: "response-1", opportunity_id: "opportunity-1", status: "interested", note: "The sensor evaluation matches my specialization, and I would like to discuss the scope.", full_name: "Emil Nilsen", field_of_study: "Robotics and control", graduation_year: 2027, email: "emil@example.no", phone: null, cv_url: null },
];
