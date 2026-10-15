import { describe, expect, test } from "bun:test";
import { buildAutoAdvancedMessage } from "@/Domain/inbox/worldAdvanceMessage";
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
