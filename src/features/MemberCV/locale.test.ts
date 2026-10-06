import { describe, expect, it, vi } from "vitest";
import {
  browserMemberLocale,
  englishCopy,
  initialMemberLocale,
  MEMBER_LOCALE_KEY,
  memberText,
  norwegianCopy,
  persistMemberLocale,
  type MemberCopyKey,
} from "./locale";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("member UI locale preference", () => {
  it.each(["nb", "nb-NO", "nn-NO", "no", "NO-no"])(
    "uses Bokmål for Norwegian browser language %s",
    (language) => {
      expect(browserMemberLocale([language])).toBe("nb");
    },
  );
  it("follows supported browser preferences and defaults to English", () => {
    expect(browserMemberLocale(["en-GB", "nb-NO"])).toBe("en");
    expect(browserMemberLocale(["de-DE", "nn-NO", "en"])).toBe("nb");
    expect(browserMemberLocale(["de-DE", "fr-FR"])).toBe("en");
    expect(browserMemberLocale([])).toBe("en");
  });
  it("keeps a selected language on reload and the next page instead of resetting to browser language", () => {
    const local = storage();
    expect(initialMemberLocale(local, ["no"])).toBe("nb");
    persistMemberLocale(local, "en");
    expect(initialMemberLocale(local, ["no"])).toBe("en");
    persistMemberLocale(local, "nb");
    expect(initialMemberLocale(local, ["en-US"])).toBe("nb");
    expect(local.getItem(MEMBER_LOCALE_KEY)).toBe("nb");
  });
  it("ignores an invalid stored value", () => {
    const local = storage();
    local.setItem(MEMBER_LOCALE_KEY, "de");
    expect(initialMemberLocale(local, ["nb-NO"])).toBe("nb");
  });
  it("works when storage is unavailable or throws", () => {
    const blocked = {
      getItem: vi.fn(() => {
        throw new Error("blocked");
      }),
      setItem: vi.fn(() => {
        throw new Error("blocked");
      }),
    };
    expect(initialMemberLocale(blocked, ["nn"])).toBe("nb");
    expect(() => persistMemberLocale(blocked, "en")).not.toThrow();
    expect(initialMemberLocale(null, ["en"])).toBe("en");
    expect(() => persistMemberLocale(null, "nb")).not.toThrow();
  });
});

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
