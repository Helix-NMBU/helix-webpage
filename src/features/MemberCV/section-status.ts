import type { CvData, CvRecord, CvSharing } from "./types";

export type CvSectionKey =
  | "contact"
  | "education"
  | "experience"
  | "projects"
  | "languages"
  | "links"
  | "skills"
  | "sharing";

export type CvSectionStatus = {
  content: "empty" | "started" | "filled";
  dirty: boolean;
};

const contactFields = [
  "fullName",
  "contactEmail",
  "phone",
  "city",
  "headline",
  "summary",
  "fieldOfStudy",
  "graduationYear",
  "references",
] as const;

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

// Compare values rather than serialized property order. Row IDs, order and
// whitespace remain part of the acknowledged draft comparison.
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameValue(value, right[index]))
    );
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return (
    keys.length === Object.keys(rightRecord).length &&
    keys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        sameValue(leftRecord[key], rightRecord[key]),
    )
  );
}

function rowContent<T extends { id: string }>(
  rows: T[],
  anchors: (keyof T)[],
): CvSectionStatus["content"] {
  const meaningful = rows.filter((row) =>
    Object.entries(row).some(
      ([key, value]) => key !== "id" && typeof value === "string" && hasText(value),
    ),
  );
  if (!meaningful.length) return "empty";
  return meaningful.every((row) =>
    anchors.every((key) => {
      const value = row[key];
      return typeof value === "string" && hasText(value);
    }),
  )
    ? "filled"
    : "started";
}

/**
 * Content hints are independent of publication rules and saved state.
 * The caller supplies only the latest server-confirmed draft as `saved`.
 */
export function getSectionStatuses(
  draft: CvData,
  sharing: CvSharing,
  saved: CvRecord,
): Record<CvSectionKey, CvSectionStatus> {
  return {
    contact: {
      content: hasText(draft.fullName)
        ? "filled"
        : contactFields.some((key) => hasText(draft[key] ?? ""))
          ? "started"
          : "empty",
      dirty: contactFields.some((key) => (draft[key] ?? "") !== (saved.draft[key] ?? "")),
    },
    education: {
      content: rowContent(draft.education, ["institution", "degree"]),
      dirty: !sameValue(draft.education, saved.draft.education),
    },
    experience: {
      content: rowContent(draft.experience, ["organization", "title"]),
      dirty: !sameValue(draft.experience, saved.draft.experience),
    },
    projects: {
      content: rowContent(draft.projects, ["name", "role"]),
      dirty: !sameValue(draft.projects, saved.draft.projects),
    },
    languages: {
      content: rowContent(draft.languages, ["name", "level"]),
      dirty: !sameValue(draft.languages, saved.draft.languages),
    },
    links: {
      content: rowContent(draft.links, ["label", "url"]),
      dirty: !sameValue(draft.links, saved.draft.links),
    },
    skills: {
      content: draft.skills.some(hasText) ? "filled" : "empty",
      dirty: !sameValue(draft.skills, saved.draft.skills),
    },
    sharing: {
      // Private settings are valid; the UI labels this as settings rather
      // than a prerequisite for CV completion.
      content: "filled",
      dirty: !sameValue(sharing, saved.sharing),
    },
  };
}
