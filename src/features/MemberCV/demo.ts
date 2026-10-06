import { emptyCv, privateSharing } from "./model";
import {
  CvRequestError,
  validateMutation,
  type CvRepository,
} from "./repository";
import type { CvData, CvEnvelope } from "./types";

export const DEMO_STORAGE_KEY = "helix-member-cv-fictional-demo-v1";

export function fictionalCv(): CvData {
  return {
    ...emptyCv("Alex Example", "alex@example.invalid"),
    city: "Ås",
    headline: "Mechanical engineering student",
    fieldOfStudy: "Mechanical engineering",
    graduationYear: "2028",
    summary:
      "I enjoy turning sketches into parts and working with other students to solve practical engineering problems.",
    education: [
      {
        id: "demo-education",
        institution: "NMBU",
        degree: "MSc Mechanical engineering",
        startDate: "2023",
        endDate: "2028",
        description:
          "Student project work in mechanics and product development.",
      },
    ],
    projects: [
      {
        id: "demo-project",
        name: "Fictional suspension project",
        role: "Design team member",
        season: "2026",
        description:
          "Prepared CAD models and compared prototype designs with the team.",
        url: "",
      },
    ],
    skills: ["CAD", "Prototyping", "Teamwork"],
    languages: [{ id: "demo-language", name: "Norwegian", level: "Native" }],
  };
}

export function createDemoRepository(
  storage: Pick<Storage, "getItem" | "setItem">,
  enabled: boolean,
): CvRepository {
  if (!import.meta.env.DEV || !enabled)
    throw new Error("The fictional demo is only available in development.");
  const initial = (): CvEnvelope => ({
    identity: { name: "Alex Example", email: "alex@example.invalid" },
    document: {
      draft: emptyCv("Alex Example", "alex@example.invalid"),
      sharing: { ...privateSharing },
      revision: 0,
      publishedRevision: null,
      publishedAt: null,
    },
  });
  function read(): CvEnvelope {
    const saved = storage.getItem(DEMO_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as CvEnvelope) : initial();
  }
  return {
    load: async () => read(),
    mutate: async (input) => {
      const mutation = validateMutation(input);
      const envelope = read();
      if (mutation.expectedRevision !== envelope.document.revision)
        throw new CvRequestError(
          "Another tab saved a newer version. Reload the saved draft before continuing. Your input has been kept.",
          409,
        );
      const nextRevision = envelope.document.revision + 1;
      const document = { ...envelope.document, revision: nextRevision };
      if (mutation.action === "save" || mutation.action === "publish") {
        if (mutation.draft) document.draft = mutation.draft;
        if (mutation.sharing) document.sharing = mutation.sharing;
      }
      if (mutation.action === "publish") {
        document.publishedRevision = nextRevision;
        document.publishedAt = new Date().toISOString();
      }
      if (mutation.action === "withdraw") {
        document.publishedRevision = null;
        document.publishedAt = null;
      }
      const result = { ...envelope, document };
      // Preserve an independent snapshot so later draft saves cannot replace the demo's published content.
      const previous = storage.getItem(DEMO_STORAGE_KEY);
      const published =
        mutation.action === "publish"
          ? { draft: document.draft, sharing: document.sharing }
          : mutation.action === "withdraw"
            ? null
            : previous
              ? (JSON.parse(previous) as { published?: unknown }).published
              : null;
      storage.setItem(
        DEMO_STORAGE_KEY,
        JSON.stringify({ ...result, published }),
      );
      return result;
    },
    preview: async () => {
      throw new Error(
        "The fictional demo uses an HTML preview. Server PDF generation needs the configured application.",
      );
    },
  };
}
