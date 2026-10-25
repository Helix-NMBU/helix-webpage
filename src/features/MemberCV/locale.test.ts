import { describe, expect, it } from "vitest";
import { englishCopy, memberText, norwegianCopy, type MemberCopyKey } from "./locale";

describe("member UI copy", () => {
  it("provides non-empty English and Bokmål text for the same keys and placeholders", () => {
    expect(Object.keys(norwegianCopy).sort()).toEqual(
      Object.keys(englishCopy).sort(),
    );
    for (const key of Object.keys(englishCopy) as MemberCopyKey[]) {
      expect(norwegianCopy[key].trim(), key).not.toBe("");
      const placeholders = (text: string) =>
        text.match(/\{\w+\}/g)?.sort() ?? [];
      expect(placeholders(norwegianCopy[key]), key).toEqual(
        placeholders(englishCopy[key]),
      );
    }
  });
  it("renders revisions and repeatable-entry labels without changing their values", () => {
    expect(
      memberText("nb", "Draft revision {revision}", { revision: 12 }),
    ).toBe("Utkastversjon 12");
    expect(
      memberText("en", "Draft revision {revision}", { revision: 12 }),
    ).toBe("Draft revision 12");
    expect(
      memberText("nb", "Remove {entry} {number}", {
        entry: memberText("nb", "education"),
        number: 2,
      }),
    ).toBe("Fjern utdanning 2");
    expect(memberText("en", "+ Add {entry}", { entry: "education" })).toBe(
      "+ Add education",
    );
  });
  it("preserves member-provided parameter text, including braces and Norwegian letters", () => {
    const email = "åse+{test}@example.invalid";
    expect(memberText("nb", "Signed in as {email}", { email })).toBe(
      `Innlogget som ${email}`,
    );
  });
  it("renders stored canonical success notices in the current language", () => {
    const notice =
      "Private draft saved. Your published version has not changed.";
    expect(memberText("en", notice)).toBe(notice);
    expect(memberText("nb", notice)).toBe(
      "Det private utkastet er lagret. Den publiserte versjonen er uendret.",
    );
    expect(memberText("en", notice)).toBe(notice);
  });
});
