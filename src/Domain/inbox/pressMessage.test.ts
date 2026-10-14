import { describe, expect, test } from "bun:test";
import { buildPressInviteMessage } from "@/Domain/inbox/inboxEvents";
import { inboxAllowed, inboxTopicOf } from "@/Domain/inbox/inboxTopics";

describe("press invite", () => {
  test("mensagem de ação, nunca filtrada", () => {
    const m = buildPressInviteMessage("2027-03-10", { pressId: "c1", trigger: "derby", kind: "pre", opponent: "Rival", expires: "2027-03-12" });
    expect(m.category).toBe("press");
    expect(m.id).toBe("press-c1");
    expect(inboxTopicOf(m)).toBe("actions");
    expect(inboxAllowed(m, { actions: true })).toBe(true);
  });

  test("um id que já começa com press- não dobra o prefixo", () => {
    const m = buildPressInviteMessage("2027-03-10", { pressId: "press-2027-03-10-derby", trigger: "derby", kind: "pre", expires: "2027-03-12" });
    expect(m.id).toBe("press-2027-03-10-derby");
  });
});
