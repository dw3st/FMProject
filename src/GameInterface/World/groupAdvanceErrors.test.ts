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

import { isTerminalGroupError, sendWithRetry } from "@/GameInterface/World/groupAdvanceErrors";

describe("sendWithRetry", () => {
  const noWait = () => Promise.resolve();
  test("retries transient failures then succeeds", async () => {
    let n = 0;
    const r = await sendWithRetry(async () => (++n < 3 ? { ok: false as const, status: 0, error: "network" } : { ok: true as const }), 3, noWait);
    expect(r.ok).toBe(true);
    expect(n).toBe(3);
  });
  test("does not retry terminal or 4xx failures", async () => {
    let n = 0;
    const r = await sendWithRetry(async () => { n++; return { ok: false as const, status: 409, error: "dayClosed" }; }, 3, noWait);
    expect(r.ok).toBe(false);
    expect(n).toBe(1);
    expect(isTerminalGroupError("dayClosed")).toBe(true);
    expect(isTerminalGroupError("network")).toBe(false);
  });
});
