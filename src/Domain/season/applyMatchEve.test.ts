import { describe, expect, test } from "bun:test";
import { applyMatchEve } from "@/Domain/season/generateRestDays";

describe("applyMatchEve (4.47.21)", () => {
  const matches = ["2032-05-04", "2032-05-08", "2032-05-09"];
  test("train on every eve after today, other rest days kept", () => {
    const out = applyMatchEve(["2032-05-03", "2032-05-05", "2032-05-07"], matches, "2032-05-01", "training");
    expect(out).toEqual(["2032-05-05"]);
  });
  test("rest on every eve, never on a match day nor before today", () => {
    expect(applyMatchEve([], matches, "2032-05-03", "rest")).toEqual(["2032-05-07"]);
  });
});
