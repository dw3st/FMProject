import { describe, expect, test } from "bun:test";
import { WORLD_CODE_LENGTH, generateWorldCode, normalizeWorldCode } from "@/Domain/multiplayer/worldCode";
import { FRIEND_CODE_ALPHABET } from "@/Domain/social/nickname";

describe("world invite code", () => {
  test("10 characters of the friend-code alphabet (no 0/1/I/O)", () => {
    let i = 0;
    const code = generateWorldCode(() => i++);
    expect(code).toHaveLength(WORLD_CODE_LENGTH);
    for (const c of code) expect(FRIEND_CODE_ALPHABET.includes(c)).toBe(true);
    expect(code).toBe("23456789AB");
  });

  test("normalize: case, spaces and dashes; anything else is null", () => {
    expect(normalizeWorldCode(" 2345-6789ab ")).toBe("23456789AB");
    expect(normalizeWorldCode("23456789A")).toBeNull();
    expect(normalizeWorldCode("23456789A0")).toBeNull();
    expect(normalizeWorldCode("23456789AI")).toBeNull();
    expect(normalizeWorldCode("23456789ABC")).toBeNull();
  });
});
