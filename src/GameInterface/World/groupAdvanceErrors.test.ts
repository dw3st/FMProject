import { describe, expect, test } from "bun:test";
import { groupAdvanceErrorKey } from "@/GameInterface/World/groupAdvanceErrors";

describe("groupAdvanceErrorKey", () => {
  test("known codes map to their key", () => {
    expect(groupAdvanceErrorKey("dayClosed")).toBe("world.advance.error.dayClosed");
    expect(groupAdvanceErrorKey("noWinner")).toBe("world.advance.error.noWinner");
  });
  test("unknown codes are generic", () => {
    expect(groupAdvanceErrorKey("HTTP 500")).toBe("world.advance.error.generic");
    expect(groupAdvanceErrorKey("network")).toBe("world.advance.error.generic");
  });
});
