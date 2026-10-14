import { describe, expect, test } from "bun:test";
import { cleanMessageBody, messageCutoff, rateLimit } from "@/Domain/social/message";
import { DAY_MS, SOCIAL } from "@/Domain/social/socialConfig";

describe("cleanMessageBody", () => {
  test("trims, normalizes line breaks and drops control characters", () => {
    expect(cleanMessageBody("  oi\r\ntudo bem?\u0007  ")).toBe("oi\ntudo bem?");
  });
  test("keeps HTML as plain text", () => {
    expect(cleanMessageBody("<b>oi</b>")).toBe("<b>oi</b>");
  });
  test("rejects empty, too long and non-strings", () => {
    expect(cleanMessageBody("   ")).toBeNull();
    expect(cleanMessageBody("x".repeat(SOCIAL.MESSAGE_MAX + 1))).toBeNull();
    expect(cleanMessageBody(42)).toBeNull();
    expect(cleanMessageBody("x".repeat(SOCIAL.MESSAGE_MAX))).toHaveLength(SOCIAL.MESSAGE_MAX);
  });
});

describe("rateLimit", () => {
  test("allows 10 in 10 s, then refuses, then frees the window", () => {
    let stamps: number[] = [];
    for (let i = 0; i < SOCIAL.RATE_MAX; i++) {
      const r = rateLimit(stamps, 1_000 + i);
      expect(r.allowed).toBe(true);
      stamps = r.stamps;
    }
    expect(rateLimit(stamps, 1_500).allowed).toBe(false);
    expect(rateLimit(stamps, 1_000 + SOCIAL.RATE_WINDOW_MS).allowed).toBe(true);
  });
});

test("messageCutoff is 90 days before now", () => {
  expect(messageCutoff(100 * DAY_MS)).toBe(10 * DAY_MS);
});
