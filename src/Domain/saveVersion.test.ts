import { describe, expect, test } from "bun:test";
import { compareVersions, GAME_VERSION, MIN_COMPATIBLE_SAVE_VERSION, saveCompatibility } from "@/Domain/saveVersion";

describe("saveVersion", () => {
  test("compares versions part by part", () => {
    expect(compareVersions("4.21.2", "4.22")).toBe(-1);
    expect(compareVersions("4.22", "4.22.0")).toBe(0);
    expect(compareVersions("4.22.1", "4.22")).toBe(1);
    expect(compareVersions("4.9", "4.10")).toBe(-1);
    expect(compareVersions("5.0", "4.99")).toBe(1);
  });

  test("absent or malformed version is outdated", () => {
    expect(saveCompatibility(undefined)).toBe("outdated");
    expect(saveCompatibility("")).toBe("outdated");
    expect(saveCompatibility("abc")).toBe("outdated");
  });

  test("versions below the minimum are outdated, the rest ok", () => {
    expect(saveCompatibility("4.21.2", "4.22")).toBe("outdated");
    expect(saveCompatibility("4.22", "4.22")).toBe("ok");
    expect(saveCompatibility("4.23", "4.22")).toBe("ok");
  });

  test("the running game is always compatible with itself", () => {
    expect(GAME_VERSION).toMatch(/^\d+(\.\d+)*$/);
    expect(saveCompatibility(GAME_VERSION)).toBe("ok");
    expect(compareVersions(MIN_COMPATIBLE_SAVE_VERSION, GAME_VERSION)).toBeLessThanOrEqual(0);
  });
});
