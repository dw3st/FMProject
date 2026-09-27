import { describe, expect, test } from "bun:test";
import { competitionsOf, isContinentalSlug } from "@/Domain/continental/competitions";

describe("isContinentalSlug", () => {
  test("recognises the 4 continental slugs", () => {
    expect(isContinentalSlug("ucl")).toBe(true);
    expect(isContinentalSlug("uel")).toBe(true);
    expect(isContinentalSlug("lib")).toBe(true);
    expect(isContinentalSlug("sud")).toBe(true);
  });

  test("rejects everything else, including a cup slug", () => {
    expect(isContinentalSlug("cup_england")).toBe(false);
    expect(isContinentalSlug("premier_league")).toBe(false);
    expect(isContinentalSlug("")).toBe(false);
  });
});

describe("competitionsOf", () => {
  test("Europe: Champions League first, then Europa League", () => {
    expect(competitionsOf("Europe").map((c) => c.slug)).toEqual(["ucl", "uel"]);
  });

  test("South America: Libertadores first, then Sul-Americana", () => {
    expect(competitionsOf("South America").map((c) => c.slug)).toEqual(["lib", "sud"]);
  });
});
