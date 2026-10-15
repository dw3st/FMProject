import { describe, expect, test } from "bun:test";
import { buildWorldMemberMessage, worldMemberNews, type MemberChange } from "@/Domain/multiplayer/worldMessages";
import { inboxTopicOf } from "@/Domain/inbox/inboxTopics";

const joined: MemberChange = {
  seatId: "s2", event: "joined", managerName: "Bia", clubId: "40", clubName: "Liverpool", leagueSlug: "premier_league",
};

describe("world member messages", () => {
  test("inbox: one message per change, competitions topic", () => {
    const m = buildWorldMemberMessage("2026-09-01", joined);
    expect(m).toMatchObject({ category: "world", kind: "member_joined", managerName: "Bia", clubName: "Liverpool", date: "2026-09-01" });
    expect(m.id).toBe("world-joined-s2-2026-09-01");
    expect(inboxTopicOf(m)).toBe("competitions");
    expect(buildWorldMemberMessage("2026-09-01", { ...joined, event: "removed" }).kind).toBe("member_removed");
  });

  test("news: importance 3, the club and the league", () => {
    const n = worldMemberNews("2026-09-01", joined);
    expect(n).toEqual({
      id: "2026-09-01:world_member:s2:joined", date: "2026-09-01", kind: "world_member", importance: 3,
      league: "premier_league", clubIds: ["40"], playerIds: [],
      params: { manager: "Bia", club: "Liverpool", event: "joined" },
    });
  });
});
