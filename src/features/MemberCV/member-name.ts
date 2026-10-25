import type { CvData } from "./types.js";

/** Member identity owns the name. CV edits and translations cannot replace it. */
export function withMemberName(draft: CvData, name: string): CvData {
  const translations = draft.translations ? structuredClone(draft.translations) : undefined;
  for (const entries of Object.values(translations ?? {})) {
    if (entries) delete entries.fullName;
  }
  return { ...draft, fullName: name, ...(translations ? { translations } : {}) };
}
