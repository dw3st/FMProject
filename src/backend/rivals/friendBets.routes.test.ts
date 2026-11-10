import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { fakeWorld } from "@/backend/testing/worldFixtures";
import { addSaveMember, deleteSaveMembers } from "@/backend/auth/saveOwnership";
import { makeUser, uniqueNick } from "@/backend/social/socialTestUtils";
import { chatMessageView, listMessages } from "@/backend/social/socialStore";
import { resetSocialRateLimit } from "@/backend/social/socialRoutes";
import { worldRoomId } from "@/Domain/social/rooms";
import { call } from "@/backend/rivals/rivalsTestUtils";
import type { Bet } from "@/types/betTypes";

const created: string[] = [];
afterAll(async () => { for (const id of created) { deleteSaveMembers(id); await saveService.deleteSave(id); } });
beforeEach(() => resetSocialRateLimit());

const bet = (id: string, o: Partial<Bet> = {}): Bet => ({
  id, placedOn: "2027-03-01", competition: "premier_league", fixtureId: "f1", date: "2027-03-05", home: "33", away: "42",
  homeName: "Man Utd", awayName: "Arsenal", pick: { market: "result", side: "away" }, stake: 1_000_000, odds: 2.5, ...o,
});

async function league() {
  const id = await fakeWorld({ seatIds: ["a", "b"], date: "2027-03-10", world: { phase: "running" } });
  created.push(id);
  const ua = makeUser(uniqueNick());
  const ub = makeUser(uniqueNick());
  addSaveMember(id, ua.id, "a", "owner");
  addSaveMember(id, ub.id, "b", "member");
  await saveService.writeBets(id, {
    open: [bet("o1", { date: "2027-03-12", status: undefined })],
    settled: [
      bet("w1", { status: "won", settledOn: "2027-03-09", payout: 2_500_000 }),
      bet("r1", { status: "refunded", settledOn: "2027-03-08", payout: 1_000_000 }),
      bet("l1", { status: "lost", settledOn: "2027-03-06", payout: 0 }),
    ],
  }, "b");
  return { id, ua, ub };
}

describe("friends' bets (8.9.7)", () => {
  test("GET friend-bets shows the open and the decided bets; 404 for an unknown seat", async () => {
    const { id, ua } = await league();
    const res = await call("/api/worlds/:saveId/friend-bets", "GET", id, ua.token, "?seat=b");
    expect(res.status).toBe(200);
    const v = await res.json();
    expect(v.open.map((b: Bet) => b.id)).toEqual(["o1"]);
    expect(v.settled.map((b: Bet) => b.id)).toEqual(["w1", "l1"]);
    expect((await call("/api/worlds/:saveId/friend-bets", "GET", id, ua.token, "?seat=zz")).status).toBe(404);
  });

  test("GET feed-bets lists the league's decided bets, newest first", async () => {
    const { id, ua } = await league();
    const v = await (await call("/api/worlds/:saveId/feed-bets", "GET", id, ua.token, "")).json();
    expect(v.bets.map((b: { id: string }) => b.id)).toEqual(["b:w1", "b:l1"]);
  });

  test("a bet phrase goes to the chat with the pick; the wrong group, a refund and one's own bet are refused", async () => {
    const { id, ua, ub } = await league();
    const path = "/api/worlds/:saveId/taunts";
    const ok = await call(path, "POST", id, ua.token, "", { target: { bet: "b:l1" }, kind: "phrase", id: "bet_lost_1" });
    expect(ok.status).toBe(200);
    const view = chatMessageView(listMessages(worldRoomId(id), ua.id, { limit: 5 })[0]!, ua.id);
    expect(view.taunt?.bet).toMatchObject({ won: false, stake: 1_000_000, homeName: "Man Utd", pick: { market: "result", side: "away" } });
    const wrong = await call(path, "POST", id, ua.token, "", { target: { bet: "b:l1" }, kind: "phrase", id: "bet_won_1" });
    expect([wrong.status, (await wrong.json()).error]).toEqual([400, "invalidTaunt"]);
    expect((await call(path, "POST", id, ua.token, "", { target: { bet: "b:r1" }, kind: "reaction", id: "fire" })).status).toBe(404);
    const self = await call(path, "POST", id, ub.token, "", { target: { bet: "b:w1" }, kind: "reaction", id: "fire" });
    expect([self.status, (await self.json()).error]).toEqual([400, "self"]);
    expect((await call(path, "POST", id, ua.token, "", { target: { bet: "b:w1", result: "x" }, kind: "reaction", id: "fire" })).status).toBe(400);
  });
});
