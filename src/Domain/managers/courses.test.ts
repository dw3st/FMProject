import { describe, expect, test } from "bun:test";
import {
  COURSES, countryOfferWeight, courseRefusal, idolClubs, isCourseLanguage, languagesOfCountries, licenceReputation,
  settledStudies, spokenLanguages, startCourse,
} from "@/Domain/managers/courses";
import type { ManagerRecord } from "@/types/managerTypes";

describe("manager courses (9.3)", () => {
  test("languages: native, groups and nations with their own", () => {
    expect(spokenLanguages("br", undefined, "2027-01-01")).toEqual(new Set(["portuguese"]));
    expect(isCourseLanguage("spanish")).toBe(true);
    expect(isCourseLanguage("Italy")).toBe(true);
    expect(isCourseLanguage("Spain")).toBe(false);
    expect(isCourseLanguage("nonsense")).toBe(false);
    expect(languagesOfCountries(["England", "Spain", "Argentina", "Italy"])).toEqual(["english", "spanish", "Italy"]);
  });

  test("a course ends on its date and is then known", () => {
    const s = startCourse(undefined, "language", "2027-01-01", "spanish");
    expect(s.course?.until).toBe("2027-04-01");
    expect(spokenLanguages("br", s, "2027-03-31").has("spanish")).toBe(false);
    expect(spokenLanguages("br", s, "2027-04-01").has("spanish")).toBe(true);
    expect(settledStudies(s, "2027-05-01").course).toBeUndefined();
  });

  test("refusals: one at a time, known, Pro needs A, money", () => {
    const spoken = new Set(["portuguese"]);
    const base = { spoken, date: "2027-01-01", wallet: 1e9 };
    expect(courseRefusal({ ...base, kind: "language", language: "portuguese", studies: undefined })).toBe("known");
    expect(courseRefusal({ ...base, kind: "pro", studies: undefined })).toBe("needsA");
    expect(courseRefusal({ ...base, kind: "a", studies: undefined, wallet: 10 })).toBe("noMoney");
    const busy = startCourse(undefined, "a", "2027-01-01");
    expect(courseRefusal({ ...base, kind: "language", language: "spanish", studies: busy })).toBe("busy");
    expect(courseRefusal({ ...base, date: "2027-04-01", kind: "pro", studies: busy })).toBeNull();
  });

  test("licences add reputation once finished", () => {
    const a = startCourse(undefined, "a", "2027-01-01");
    expect(licenceReputation(a, "2027-01-02")).toBe(0);
    const pro = startCourse(a, "pro", "2027-04-01");
    expect(licenceReputation(pro, "2027-04-02")).toBe(COURSES.LICENCE.a.reputation);
    expect(licenceReputation(pro, "2027-12-01")).toBe(COURSES.LICENCE.a.reputation + COURSES.LICENCE.pro.reputation);
  });

  test("idol clubs and the offer weight by country", () => {
    const rec = {
      clubs: [{ squadId: "a", from: "2020-01-01", to: "2025-01-01" }, { squadId: "b", from: "2025-01-02", to: "2025-06-01" }, { squadId: "c", from: "2025-06-02" }],
      titles: [{ season: "2025", kind: "cup", competition: "x", squadId: "b", points: 1, on: "2025-05-01" }],
    } as unknown as ManagerRecord;
    expect(idolClubs(rec, "2026-01-01")).toEqual(new Set(["a", "b"]));
    const spoken = new Set(["portuguese"]);
    expect(countryOfferWeight("Brazil", spoken, new Set())).toBe(1);
    expect(countryOfferWeight("Spain", spoken, new Set())).toBe(0.5);
    expect(countryOfferWeight("Spain", spoken, new Set(["Spain"]))).toBe(0.75);
    expect(countryOfferWeight("Portugal", spoken, new Set(["Portugal"]))).toBe(1.5);
  });
});
