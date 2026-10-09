import { describe, expect, test } from "bun:test";
import { buildRegistrationMessage } from "@/Domain/inbox/registrationMessage";
import { inboxTopicOf } from "@/Domain/inbox/inboxTopics";
import type { RegistrationNotice } from "@/types/registrationTypes";

const base = { competition: "premier_league", season: "2026-27" };

describe("registration inbox messages", () => {
  test("each kind has an English subject, a stable id and the competitions topic", () => {
    const kinds: RegistrationNotice[] = [
      { ...base, kind: "auto_list" },
      { ...base, kind: "not_fit", playerIds: ["a"] },
      { ...base, kind: "waiting", playerIds: ["a"], opensOn: "2027-01-01" },
      { ...base, kind: "closing", until: "2026-08-31", counts: { counted: 23, max: 25, foreign: 3, maxForeign: null, formed: 8, minFormed: 8, lostSlots: 0, free: 2 } },
      { ...base, kind: "exception" },
    ];
    for (const notice of kinds) {
      const m = buildRegistrationMessage({ date: "2026-08-28", notice, competitionName: "Premier League", players: [{ id: "a", name: "A. Player" }] });
      expect(m.subject.startsWith("Premier League")).toBe(true);
      expect(m.category).toBe("registration");
      expect(inboxTopicOf(m)).toBe("competitions");
      expect(m.id).toBe(buildRegistrationMessage({ date: "2026-08-28", notice, competitionName: "x" }).id);
    }
    const waiting = buildRegistrationMessage({ date: "d", notice: kinds[2]!, competitionName: "PL", players: [{ id: "a", name: "A" }] });
    expect(waiting.preview).toBe("A — from 2027-01-01");
    expect(waiting.opensOn).toBe("2027-01-01");
    const closing = buildRegistrationMessage({ date: "d", notice: kinds[3]!, competitionName: "PL" });
    expect(closing.preview).toBe("23/25 registered");
  });
});
