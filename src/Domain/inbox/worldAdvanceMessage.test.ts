import { describe, expect, test } from "bun:test";
import { buildAutoAdvancedMessage, buildLiveRefusedMessage, liveRefusedReason } from "@/Domain/inbox/worldAdvanceMessage";
import { inboxTopicOf } from "@/Domain/inbox/inboxTopics";

describe("buildAutoAdvancedMessage", () => {
  test("world / auto_advanced with the stop date and the simulated game, never dropped", () => {
    const m = buildAutoAdvancedMessage({ date: "2027-03-10", until: "2027-03-13", simulated: "2027-03-12" });
    expect(m.category).toBe("world");
    expect(m.kind).toBe("auto_advanced");
    expect(m.until).toBe("2027-03-13");
    expect(m.simulated).toBe("2027-03-12");
    expect(m.id).toBe("world-auto-2027-03-10-2027-03-13");
    expect(inboxTopicOf(m)).toBe("actions");
  });
});

describe("buildLiveRefusedMessage", () => {
  test("world / live_refused with the game date and the reason, never dropped", () => {
    const m = buildLiveRefusedMessage({ date: "2027-03-10", reason: "unregistered" });
    expect(m.category).toBe("world");
    expect(m.kind).toBe("live_refused");
    expect(m.match).toBe("2027-03-10");
    expect(m.reason).toBe("unregistered");
    expect(m.id).toBe("world-live-refused-2027-03-10");
    expect(inboxTopicOf(m)).toBe("actions");
  });
  test("the day's refusal text maps to a reason code", () => {
    expect(liveRefusedReason("unregistered player in recording")).toBe("unregistered");
    expect(liveRefusedReason("knockout recording without a winner")).toBe("knockout");
    expect(liveRefusedReason("a match between two seats has no live recording")).toBe("two_seats");
    expect(liveRefusedReason("anything else")).toBe("other");
  });
});
