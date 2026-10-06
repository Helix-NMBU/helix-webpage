export type CvEducation = { id: string; institution: string; degree: string; startDate: string; endDate: string; description: string };
export type CvExperience = { id: string; organization: string; title: string; startDate: string; endDate: string; description: string };
export type CvProject = { id: string; name: string; role: string; season: string; description: string; url: string };
export type CvLanguage = { id: string; name: string; level: string };
export type CvLink = { id: string; label: string; url: string };
export type CvData = {
  fullName: string; contactEmail: string; phone: string; city: string; headline: string; summary: string;
  fieldOfStudy: string; graduationYear: string;
  education: CvEducation[]; experience: CvExperience[]; projects: CvProject[];
  skills: string[]; languages: CvLanguage[]; links: CvLink[];
};
export type CvSharing = { cv: boolean; email: boolean; phone: boolean };
export type CvRecord = { draft: CvData; sharing: CvSharing; revision: number; publishedRevision: number | null; publishedAt: string | null };
export type CvEnvelope = { document: CvRecord; identity: { email: string; name: string } };
export type CvMutation = { action: "save" | "publish" | "withdraw" | "preview"; draft?: CvData; sharing?: CvSharing; expectedRevision?: number };
export type PdfRenderer = (data: CvData, sharing: CvSharing) => Promise<Uint8Array>;
