import { describe, expect, test } from "bun:test";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";

describe("RIVALS", () => {
  test("the live limits are coherent", () => {
    expect(RIVALS.FEED_MAX).toBe(300);
    expect(RIVALS.LIVE_MAX_EVENTS).toBe(80);
    expect(RIVALS.LIVE_MAX_MINUTE).toBe(130);
    expect(RIVALS.LIVE_STALE_MS).toBeLessThan(RIVALS.LIVE_DROP_MS);
    expect(RIVALS.LIVE_ENDED_KEEP_MS).toBe(10 * 60_000);
    expect(RIVALS.POPUP_MAX).toBe(3);
    expect(RIVALS.POPUP_MS).toBe(8_000);
  });
});
