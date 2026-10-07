import { describe, expect, it } from "vitest";
import {
  composeProfileDate,
  currentPeriod,
  profileDateParts,
  profileDateValidation,
  readableProfileDate,
  toggleCurrentPeriod,
  profileChoiceSelection,
  languageLevels,
} from "./profile-inputs";

describe("member period input compatibility", () => {
  it.each([
    ["2024", "2024", "", ""],
    ["2024-09", "2024", "09", ""],
    ["2024-09-01", "2024", "09", "01"],
  ])("parses existing canonical %s without rewriting it", (value, year, month, day) => {
    expect(profileDateParts(value)).toEqual({ year, month, day, legacy: false });
    expect(composeProfileDate(year, month, day)).toBe(value);
    expect(profileDateValidation(value)).toBe("valid");
  });
  it.each(["Sep 2024", "Spring 2023", "Present", "01.09.2024", "2024/2025"])(
    "leaves free legacy date %s untouched and valid",
    (value) => {
      expect(profileDateParts(value).legacy).toBe(true);
      expect(readableProfileDate(value)).toBe(value);
      expect(profileDateValidation(value)).toBe("valid");
    },
  );
  it("retains month and optional day while year is cleared or partially entered", () => {
    const cleared = composeProfileDate("", "05", "12");
    expect(cleared).toBe("-05-12");
    expect(profileDateParts(cleared)).toEqual({ year: "", month: "05", day: "12", legacy: false });
    expect(composeProfileDate("202", "05", "12")).toBe("202-05-12");
    expect(profileDateValidation(cleared)).toBe("partial");
    expect(readableProfileDate(cleared)).toBe(cleared);
  });
  it("keeps missing components and leading digit prefixes without inventing them", () => {
    expect(composeProfileDate("", "")).toBe("");
    expect(composeProfileDate("20", "")).toBe("20");
    expect(composeProfileDate("", "1")).toBe("-1");
    expect(composeProfileDate("", "", "12")).toBe("--12");
    expect(composeProfileDate("2024", "", "12")).toBe("2024--12");
    for (const value of ["20", "-1", "-0", "2024-1", "2024-01-0", "--12", "2024--12", "2024-", "2024-01-", "-"]) {
      expect(profileDateParts(value).legacy).toBe(false);
      expect(profileDateValidation(value)).toBe("partial");
      expect(readableProfileDate(value)).toBe(value);
    }
  });
  it.each([
    ["2024-13", "month"], ["2024-00", "month"], ["2024-01-00", "day"],
    ["2024-01-32", "day"], ["2024-04-31", "day"], ["2023-02-29", "day"],
    ["1900-02-29", "day"], ["2024-02-30", "day"], ["0000", "year"],
  ])("marks invalid numeric %s as %s while preserving all entered parts", (value, issue) => {
    expect(profileDateValidation(value)).toBe(issue);
    expect(readableProfileDate(value)).toBe(value);
    const { year, month, day } = profileDateParts(value);
    expect(composeProfileDate(year, month, day)).toBe(value);
  });
  it.each(["2024-02-29", "2000-02-29", "2023-02-28", "2024-01-31", "2024-12", "2024", ""])(
    "allows complete calendar date, year/month or year-only %s",
    (value) => expect(profileDateValidation(value)).toBe("valid"),
  );
  it("shows complete dates in European order in either interface language", () => {
    expect(readableProfileDate("2024-09-01")).toBe("01.09.2024");
    expect(readableProfileDate("2024-09")).toBe("09.2024");
    expect(readableProfileDate("2024")).toBe("2024");
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
    expect(readableProfileDate("Present")).toBe(
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
