import { describe, expect, test } from "bun:test";
import { mapWorldError } from "@/GameInterface/World/worldApi";

describe("mapWorldError", () => {
  test("keeps a known world code", () => {
    expect(mapWorldError(409, "full")).toBe("full");
    expect(mapWorldError(404, "notFound")).toBe("notFound");
  });
  test("unknown server text is generic, a bare 404 is notMember", () => {
    expect(mapWorldError(500, "boom")).toBe("generic");
    expect(mapWorldError(404, "save not found")).toBe("notMember");
    expect(mapWorldError(400, undefined)).toBe("generic");
  });
});
