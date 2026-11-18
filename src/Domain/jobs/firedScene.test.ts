import { describe, expect, test } from "bun:test";
import { FIRED_SCENES, firedSceneFile } from "@/Domain/jobs/firedScene";

describe("firedSceneFile", () => {
  test("fixed per sacking and every scene is drawn", () => {
    expect(firedSceneFile("2027-11-15", "Brusque")).toBe(firedSceneFile("2027-11-15", "Brusque"));
    const seen = new Set<string>();
    for (let d = 1; d <= 60; d++) seen.add(firedSceneFile(`2027-03-${String(d).padStart(2, "0")}`, "Club"));
    expect([...seen].sort()).toEqual([...FIRED_SCENES].sort());
  });
});
