export type PartnerOrganization = { id: string; name: string };
export type PartnerSession = {
  user: { email: string; name: string };
  organizations: PartnerOrganization[];
};
export type PartnerCv = {
  memberId: string;
  fullName: string;
  fieldOfStudy: string | null;
  graduationYear: number | null;
  contactEmail: string | null;
  phone: string | null;
  hasPdf: boolean;
};
export type PartnerDirectory = { members: PartnerCv[] };
export type PartnerDownload = { url: string; expiresIn: number };
