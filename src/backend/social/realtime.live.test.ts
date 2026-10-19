import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { addSaveMember } from "@/backend/auth/saveOwnership";
import { handleClientEvent, onSocketOpen, resetRealtime, type SocialSocket } from "@/backend/social/realtime";
import { liveScoresOf, resetLiveScores, setLiveResolver } from "@/backend/rivals/liveScores";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { RIVALS } from "@/Domain/rivals/rivalsConfig";
import type { ServerEvent } from "@/types/socialTypes";

type FakeSocket = SocialSocket & { events: ServerEvent[] };
function fakeSocket(userId: string): FakeSocket {
  const events: ServerEvent[] = [];
  return {
    data: { userId, session: "s", saveId: null, clubName: null }, events,
    send(m: string) { events.push(JSON.parse(m) as ServerEvent); }, close() {},
  };
}

afterEach(() => { resetRealtime(); resetLiveScores(); });

describe("live_score on the socket", () => {
  test("relayed as friend_live; junk and floods are ignored", async () => {
    const saveId = randomUUID();
    const a = makeUser(uniqueNick());
    const b = makeUser(uniqueNick());
    addSaveMember(saveId, a.id, "a", "owner");
    addSaveMember(saveId, b.id, "b", "member");
    setLiveResolver(async () => ({
      base: { seatId: "a", nickname: a.nickname!, clubId: "c1", clubName: "Vasco", opponentId: "c2", opponentName: "Bahia",
        home: true, fixtureId: "f1", date: "2027-03-10" },
      scorers: [],
    }));
    const wa = fakeSocket(a.id);
    const wb = fakeSocket(b.id);
    onSocketOpen(wa);
    onSocketOpen(wb);
    await handleClientEvent(wa, JSON.stringify({ type: "live_score", saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }));
    expect(wb.events.at(-1)).toMatchObject({ type: "friend_live", saveId, seatId: "a" });
    expect(wa.events).toEqual([]);
    await handleClientEvent(wa, JSON.stringify({ type: "live_score", saveId, fixtureId: "f1", phase: "goal", minute: 999, score: { for: 1, against: 0 } }));
    await handleClientEvent(wa, "{not json");
    expect(wb.events).toHaveLength(1);
    for (let i = 0; i < RIVALS.LIVE_PER_MINUTE + 5; i++) {
      await handleClientEvent(wa, JSON.stringify({ type: "live_score", saveId, fixtureId: "f1", phase: "start", minute: 0, score: { for: 0, against: 0 } }));
    }
    expect(liveScoresOf(saveId)[0]!.events).toBeLessThanOrEqual(RIVALS.LIVE_PER_MINUTE);
  });
});
