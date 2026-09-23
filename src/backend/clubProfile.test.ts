import { describe, expect, test } from "bun:test";
import { clubProfileStem } from "@/backend/clubProfile";

const standings = [
  { squadId: "33", slug: "manchester_united" },
  { squadId: "of_ae_al_ain", slug: "al_ain" },
];

describe("clubProfileStem", () => {
  test("resolves by squadId", () => {
    expect(clubProfileStem(standings, "33")).toBe("33");
  });
  test("resolves by slug", () => {
    expect(clubProfileStem(standings, "manchester_united")).toBe("33");
  });
  test("of_* squadId resolves to itself", () => {
    expect(clubProfileStem(standings, "of_ae_al_ain")).toBe("of_ae_al_ain");
  });
  test("unknown club returns null", () => {
    expect(clubProfileStem(standings, "nope")).toBeNull();
  });
});
