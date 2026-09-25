import { expect, test } from "bun:test";
import { logoUrlFromIndex } from "@/Domain/world/logos";

test("logoUrlFromIndex", () => {
  const idx = { "33": "premier_league/manchester_united", es_1: "espn/es_1" };
  expect(logoUrlFromIndex(idx, "33")).toBe("/api/logos/premier_league/manchester_united");
  expect(logoUrlFromIndex(idx, "es_1")).toBe("/api/logos/espn/es_1");
  expect(logoUrlFromIndex(idx, "nope")).toBeUndefined();
});
