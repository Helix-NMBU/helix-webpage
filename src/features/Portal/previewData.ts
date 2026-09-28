import type { HelixEngagement, MemberOpportunity, PortalContext, PortalResource, SponsorRequest, SponsorResponse } from "./types";

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
  agreementStartsAt: "2026-09-01",
  agreementEndsAt: "2027-06-30",
  isReturningSponsor: false,
  hasUpcomingAgreement: false,
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

type SampleShares = { cv?: boolean; email?: boolean; phone?: boolean; linkedin?: boolean };

const sampleMember = (index: number, full_name: string, field_of_study: string, graduation_year: number, photo: string | null, shares: SampleShares) => {
  const slug = full_name.toLowerCase().replace(/[^a-z]+/g, "-");
  return {
    id: `member-${index}`, full_name, field_of_study, graduation_year,
    email: shares.email ? `${slug.split("-")[0]}@example.no` : null, personal_email: null,
    personal_phone: shares.phone ? "+47 400 00 000" : null,
    linkedin: shares.linkedin ? "https://www.linkedin.com" : null,
    profile_image_url: photo && `/portrettbilder/${photo}.webp`,
    cv_url: shares.cv ? `preview/${slug}.pdf` : null,
    share_cv: Boolean(shares.cv), share_email: Boolean(shares.email), share_phone: Boolean(shares.phone),
  };
};

export const previewMembers = [
  { id: "member-1", full_name: "Ingrid Hansen", email: "ingrid@example.no", personal_email: null, personal_phone: null, linkedin: "https://www.linkedin.com", field_of_study: "Mechanical engineering", graduation_year: 2027, profile_image_url: "/portrettbilder/eira_bakstad.webp", cv_url: "preview/ingrid-hansen.pdf", share_cv: true, share_email: true, share_phone: false },
  { id: "member-2", full_name: "Sander Berg", email: null, personal_email: null, personal_phone: null, linkedin: "https://www.linkedin.com", field_of_study: "Robotics and control", graduation_year: 2026, profile_image_url: null, cv_url: null, share_cv: false, share_email: false, share_phone: false },
  { id: "member-3", full_name: "Mina Solheim", email: "mina@example.no", personal_email: null, personal_phone: null, linkedin: "https://www.linkedin.com", field_of_study: "Data science", graduation_year: 2028, profile_image_url: "/portrettbilder/ane_byrkjeland.webp", cv_url: "preview/mina-solheim.pdf", share_cv: true, share_email: true, share_phone: false },
  // Made-up names with team portraits as stand-ins, so the directory can be previewed at a realistic size.
  sampleMember(4, "Sindre Lunde", "Mechanical engineering", 2027, "andre_rasen", { cv: true, email: true, linkedin: true }),
  sampleMember(5, "Eirik Haugen", "Electrical engineering", 2028, "birk_sveberg", { cv: true, linkedin: true }),
  sampleMember(6, "Kristian Moe", "Mechanical engineering", 2026, "brede_aasen", { cv: true, email: true, phone: true }),
  sampleMember(7, "Jakob Eide", "Computational science", 2027, "dat_bui", { cv: true, email: true }),
  sampleMember(8, "Thea Kristiansen", "Renewable energy", 2029, "elina_andersen", { email: true }),
  sampleMember(9, "Magnus Fjeld", "Robotics and control", 2027, "fredrik_skyum", { cv: true, email: true, linkedin: true }),
  sampleMember(10, "Nora Berntsen", "Industrial economics", 2026, "henrikke_ellewsen", { cv: true, email: true, phone: true }),
  sampleMember(11, "Håkon Lie", "Mechanical engineering", 2028, "isak_kjos", { linkedin: true }),
  sampleMember(12, "Even Strand", "Data science", 2027, "jonas_skarvang", { cv: true, email: true }),
  sampleMember(13, "Ida Sæther", "Product design", 2028, "kornelia_rapp", { cv: true, email: true, linkedin: true }),
  sampleMember(14, "Tobias Nygård", "Electrical engineering", 2029, "lukas_thorsrud", { linkedin: true }),
  sampleMember(15, "Sofie Lien", "Environmental physics", 2027, "margrete_magnussen", { cv: true, email: true }),
  sampleMember(16, "Amalie Holm", "Industrial economics", 2028, "mariamawit_natnael", { cv: true, email: true, linkedin: true }),
  sampleMember(17, "Aksel Dahl", "Robotics and control", 2029, "martin_hansen", { cv: true }),
  sampleMember(18, "Ole Martin Rønning", "Structural engineering", 2026, "oliver_olsen", { cv: true, email: true, phone: true }),
  sampleMember(19, "Maja Solberg", "Product design", 2027, "selma_woldseth", { email: true }),
  sampleMember(20, "Elias Hovland", "Mechanical engineering", 2028, "simon_sivertsen", { cv: true, linkedin: true }),
  sampleMember(21, "Emil Nilsen", "Robotics and control", 2027, null, { cv: true, email: true }),
  sampleMember(22, "Vilde Andreassen", "Data science", 2026, null, { cv: true, email: true }),
  sampleMember(23, "Adrian Pedersen", "Electrical engineering", 2028, null, { linkedin: true }),
  sampleMember(24, "Julie Knutsen", "Renewable energy", 2029, null, {}),
  sampleMember(25, "Oskar Hagen", "Computational science", 2027, null, { cv: true }),
];

export const previewResponses: SponsorResponse[] = [
  { id: "response-1", opportunity_id: "opportunity-1", status: "interested", note: "The sensor evaluation matches my specialization, and I would like to discuss the scope.", created_at: "2026-09-16T14:20:00Z", full_name: "Emil Nilsen", field_of_study: "Robotics and control", graduation_year: 2027, profile_image_url: null, email: "emil@example.no", phone: null, cv_url: null },
  { id: "response-2", opportunity_id: "opportunity-1", status: "interested", note: "I worked on the perception stack for our autonomous car this season and would love to take this further in a thesis.", created_at: "2026-09-18T09:05:00Z", full_name: "Ingrid Hansen", field_of_study: "Mechanical engineering", graduation_year: 2027, profile_image_url: null, email: "ingrid@example.no", phone: null, cv_url: "preview/ingrid-hansen.pdf" },
  { id: "response-3", opportunity_id: "opportunity-2", status: "interested", note: "I graduate next spring and have supplier follow-up experience from the Helix chassis team.", created_at: "2026-09-21T11:40:00Z", full_name: "Mina Solheim", field_of_study: "Data science", graduation_year: 2028, profile_image_url: null, email: null, phone: null, cv_url: null },
];
