import { describe, expect, test } from "bun:test";
import { canonicalVersion, compareVersions, GAME_VERSION, MIN_COMPATIBLE_SAVE_VERSION, saveCompatibility } from "@/Domain/saveVersion";

describe("saveVersion", () => {
  test("compares versions part by part", () => {
    expect(compareVersions("4.21.2", "4.22")).toBe(-1);
    expect(compareVersions("4.22", "4.22.0")).toBe(0);
    expect(compareVersions("4.22.1", "4.22")).toBe(1);
    expect(compareVersions("4.9", "4.10")).toBe(-1);
    expect(compareVersions("5.1", "5.0.9")).toBe(1);
  });

  test("the old names 4.10 … 4.48 are the renamed releases 5.0 … 8.8", () => {
    expect(canonicalVersion("4.9")).toBe("4.9");
    expect(canonicalVersion("4.9.1")).toBe("4.9.1");
    expect(canonicalVersion("4.10")).toBe("5.0");
    expect(canonicalVersion("4.19.1")).toBe("5.9.1");
    expect(canonicalVersion("4.25")).toBe("6.5");
    expect(canonicalVersion("4.35.2")).toBe("7.5.2");
    expect(canonicalVersion("4.41.53")).toBe("8.1.53");
    expect(canonicalVersion("4.48")).toBe("8.8");
    expect(canonicalVersion("8.8")).toBe("8.8");
    expect(compareVersions("4.48", "8.8")).toBe(0);
    expect(compareVersions("4.47.23", "8.8")).toBe(-1);
  });

  test("a save from an old name keeps loading", () => {
    // The friends world was created on 4.35.2 (now 7.5.2); the minimum is 6.5 (old 4.25).
    expect(saveCompatibility("4.35.2")).toBe("ok");
    expect(saveCompatibility("4.24.1")).toBe("outdated");
    expect(saveCompatibility("4.25")).toBe("ok");
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
