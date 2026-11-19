import { describe, expect, test } from "bun:test";
import { FAST_FORWARD_STEP_DAYS, nextFastForwardAction } from "@/GameInterface/fastForwardStep";

describe("nextFastForwardAction", () => {
  test("one day per request", () => expect(FAST_FORWARD_STEP_DAYS).toBe(1));
  test("keeps going day by day until the server says done", () => {
    expect(nextFastForwardAction({ done: false, daysAdvanced: 1 }, true, false)).toBe("continue");
    expect(nextFastForwardAction({ done: true, daysAdvanced: 1 }, true, false)).toBe("done");
  });
  test("cancel stops after the day that ran", () => {
    expect(nextFastForwardAction({ done: false, daysAdvanced: 1 }, true, true)).toBe("cancelled");
  });
  test("the server's stop wins over a cancel pressed at the same time", () => {
    expect(nextFastForwardAction({ done: true, daysAdvanced: 1 }, true, true)).toBe("done");
    expect(nextFastForwardAction({ done: true, sacked: true }, true, true)).toBe("fired");
    expect(nextFastForwardAction({ done: true, renewalOffer: true }, true, true)).toBe("renewal");
  });
  test("errors and renewal pending", () => {
    expect(nextFastForwardAction({ error: "renewalPending" }, false, false)).toBe("renewal");
    expect(nextFastForwardAction({ error: "boom" }, false, false)).toBe("error");
    expect(nextFastForwardAction({ done: false, daysAdvanced: 1 }, false, false)).toBe("error");
  });
  test("no day advanced and not done: stop instead of spinning", () => {
    expect(nextFastForwardAction({ done: false, daysAdvanced: 0 }, true, false)).toBe("cancelled");
  });
});
