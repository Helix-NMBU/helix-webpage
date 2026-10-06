import { describe, expect, it } from "vitest";
import {
  composeProfileDate,
  currentPeriod,
  profileDateParts,
  readableProfileDate,
  toggleCurrentPeriod,
  profileChoiceSelection,
  languageLevels,
} from "./profile-inputs";
import { months } from "./profile-inputs";

describe("member period input compatibility", () => {
  it("represents year-only and month/year dates without adding an unspecified month", () => {
    expect(profileDateParts("2024")).toEqual({
      year: "2024",
      month: "",
      legacy: false,
    });
    expect(profileDateParts("2024-09")).toEqual({
      year: "2024",
      month: "09",
      legacy: false,
    });
    expect(composeProfileDate("2024", "")).toBe("2024");
    expect(composeProfileDate("2024", "09")).toBe("2024-09");
  });
  it.each([
    "Sep 2024",
    "Spring 2023",
    "2024-13",
    "2024-5",
    "2024-09-01",
    "Present",
  ])(
    "keeps existing free date %s readable and editable without a conversion",
    (value) => {
      expect(profileDateParts(value).legacy).toBe(true);
      expect(readableProfileDate(value, (index) => months[index])).toBe(value);
    },
  );
  it("keeps the selected month in the draft while a year is cleared or partially retyped", () => {
    const cleared = composeProfileDate("", "05");
    expect(cleared).toBe("-05");
    expect(profileDateParts(cleared)).toEqual({
      year: "",
      month: "05",
      legacy: false,
    });
    const partial = composeProfileDate("202", profileDateParts(cleared).month);
    expect(partial).toBe("202-05");
    expect(readableProfileDate(partial, (index) => months[index])).toBe(
      partial,
    );
    expect(composeProfileDate("2027", profileDateParts(partial).month)).toBe(
      "2027-05",
    );
  });
  it("keeps a blank or partial year without inventing a month or year", () => {
    expect(composeProfileDate("", "")).toBe("");
    expect(composeProfileDate("20", "")).toBe("20");
    expect(profileDateParts("20")).toEqual({
      year: "20",
      month: "",
      legacy: false,
    });
  });
  it("formats only complete month/year values with the currently chosen language", () => {
    expect(readableProfileDate("2024-09", () => "September")).toBe(
      "September 2024",
    );
    expect(readableProfileDate("2024-09", () => "Septembre")).toBe(
      "Septembre 2024",
    );
    expect(readableProfileDate("2024", () => "unused")).toBe("2024");
  });
  it("restores the exact prior free-text end date when the current-role choice is reversed", () => {
    const current = toggleCurrentPeriod(true, "Summer 2028", "");
    expect(current).toEqual({ value: "Present", previous: "Summer 2028" });
    expect(currentPeriod(current.value)).toBe(true);
    expect(
      toggleCurrentPeriod(false, current.value, current.previous).value,
    ).toBe("Summer 2028");
  });
  it("leaves education's legacy Present date editable when there is no current-role control", () => {
    expect(currentPeriod("Present", false)).toBe(false);
    expect(profileDateParts("Present").legacy).toBe(true);
    expect(readableProfileDate("Present", (index) => months[index])).toBe(
      "Present",
    );
    expect(currentPeriod("Present", true)).toBe(true);
  });
  it("does not fabricate an end date for a role that was already current when loaded", () => {
    expect(toggleCurrentPeriod(false, "Present", "").value).toBe("");
    expect(toggleCurrentPeriod(true, "Present", "2028-06").previous).toBe(
      "2028-06",
    );
  });
});

describe("profile choice compatibility", () => {
  it("keeps existing custom levels distinct from UI-only option tokens", () => {
    expect(profileChoiceSelection("__none", languageLevels, false)).toBe(
      "custom-current",
    );
    expect(profileChoiceSelection("not-specified", languageLevels, false)).toBe(
      "custom-current",
    );
    expect(
      profileChoiceSelection(
        "Fluent in technical conversations",
        languageLevels,
        false,
      ),
    ).toBe("custom-current");
  });
  it("represents explicit canonical selections without changing their stored wording", () => {
    expect(
      profileChoiceSelection(languageLevels[0], languageLevels, false),
    ).toBe(`option:${languageLevels[0]}`);
    expect(profileChoiceSelection("", languageLevels, false)).toBe(
      "not-specified",
    );
    expect(profileChoiceSelection("Fluent", languageLevels, true)).toBe(
      "custom-edit",
    );
  });
});
