import { describe, expect, test } from "bun:test";
import { isNewVersion } from "@/GameInterface/changelog/useNewVersion";

describe("isNewVersion", () => {
  test("a different server version is new", () => {
    expect(isNewVersion("8.8.7", "8.8.8")).toBe(true);
  });
  test("the same version, or an odd answer, is not", () => {
    expect(isNewVersion("8.8.7", "8.8.7")).toBe(false);
    expect(isNewVersion("8.8.7", "")).toBe(false);
    expect(isNewVersion("8.8.7", undefined)).toBe(false);
    expect(isNewVersion("8.8.7", 9)).toBe(false);
  });
});
