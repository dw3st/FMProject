import { describe, expect, test } from "bun:test";
import {
  FRIEND_CODE_ALPHABET,
  generateFriendCode,
  nicknameChangeableAt,
  nicknameKey,
  normalizeFriendCode,
  validateNickname,
} from "@/Domain/social/nickname";
import { DAY_MS } from "@/Domain/social/socialConfig";

describe("validateNickname", () => {
  test("accepts 3–20 letters, digits, _ . - (trimmed)", () => {
    for (const n of ["abc", "Ze_Carlos", "a.b-c", "x".repeat(20), "  Tom99  "]) expect(validateNickname(n)).toBeNull();
  });
  test("rejects the wrong length", () => {
    for (const n of ["", "ab", "  ab  ", "x".repeat(21)]) expect(validateNickname(n)).toBe("length");
  });
  test("rejects other characters", () => {
    for (const n of ["ab c", "joão", "a@b", "<b>hi</b>"]) expect(validateNickname(n)).toBe("chars");
  });
  test("rejects reserved words in any case, also inside the name", () => {
    for (const n of ["admin", "ADMIN", "SuperAdmin", "fmproject", "FM_westlab", "Moderator", "root", "Suporte"]) {
      expect(validateNickname(n)).toBe("reserved");
    }
  });
});

test("nicknameKey ignores case and spaces around", () => {
  expect(nicknameKey("  ZeCarlos ")).toBe("zecarlos");
});

test("nicknameChangeableAt is 30 days after the last change", () => {
  expect(nicknameChangeableAt(null)).toBeNull();
  expect(nicknameChangeableAt(1_000)).toBe(1_000 + 30 * DAY_MS);
});

describe("friend code", () => {
  test("FM-XXXX-XXXX with no ambiguous characters", () => {
    let i = 0;
    const code = generateFriendCode((n) => (i++ * 7) % n);
    expect(code).toMatch(/^FM-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
    expect(FRIEND_CODE_ALPHABET).toHaveLength(32);
    expect(FRIEND_CODE_ALPHABET).not.toMatch(/[01IO]/);
  });
  test("normalizes what people type", () => {
    for (const raw of ["fm-abcd-efgh", "FM ABCD EFGH", "abcdefgh", "FMABCDEFGH", " fm-ABCD-efgh "]) {
      expect(normalizeFriendCode(raw)).toBe("FM-ABCD-EFGH");
    }
  });
  test("rejects wrong codes", () => {
    for (const raw of ["FM-ABCD-EFG", "FM-ABCD-EFG0", "FM-ABCD-EFGI", "", "hello"]) {
      expect(normalizeFriendCode(raw)).toBeNull();
    }
  });
});
