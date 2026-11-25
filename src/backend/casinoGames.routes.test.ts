/** Games hall routes: race, bingo and blackjack (`.claude/rules/game/casino.md`). */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";

describe("games hall", () => {
  let saveId = "";
  let seatId = "";
  let token = "";
  const call = async (path: string, method: string, body?: unknown) => {
    const handler = apiRoutes[`/api/saves/:saveId/casino${path}` as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/casino${path}`, {
        method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: { saveId } },
    ));
    return { status: res.status, data: await res.json() as any };
  };
  const net = async () => (await saveService.getSeatMeta(saveId, seatId))!.casinoNet ?? 0;

  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("gameshall@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
    seatId = (await saveService.listSeats(saveId))[0]!.seatId;
    await saveService.updateSeat(saveId, seatId, { managerEarnings: 1_000_000 });
  }, 270_000);
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("race: the card on offer is run, paid by its odds, and the next card follows", async () => {
    const v = await call("", "GET");
    const card = v.data.race;
    expect(card.cars).toHaveLength(8);
    expect((await call("/race/bet", "POST", { car: 9, kind: "win", stake: 1_000 })).data.error).toBe("invalidBet");
    expect((await call("/race/bet", "POST", { car: 1, kind: "win", stake: 50_000 })).data.error).toBe("stakeTooHigh");
    const before = await net();
    const r = await call("/race/bet", "POST", { car: 1, kind: "top3", stake: 2_000 });
    expect(r.status).toBe(200);
    expect(r.data.result.card).toEqual(card);
    expect([...r.data.result.order].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const podium = r.data.result.order.slice(0, 3).includes(1);
    expect(r.data.result.payout).toBe(podium ? Math.floor(2_000 * card.cars[0].top3Odds) : 0);
    expect(await net()).toBe(before + r.data.result.payout - 2_000);
    expect(r.data.view.race.no).toBe(card.no + 1);
  });

  test("bingo: 1 to 4 cards at the stake each", async () => {
    expect((await call("/bingo/play", "POST", { cards: 5, stake: 1_000 })).data.error).toBe("invalidBet");
    const before = await net();
    const r = await call("/bingo/play", "POST", { cards: 3, stake: 1_000 });
    expect(r.status).toBe(200);
    expect(r.data.result.cards).toHaveLength(3);
    expect(r.data.result.balls).toHaveLength(30);
    expect(await net()).toBe(before + r.data.result.payout - 3_000);
    expect(r.data.view.history[0].stake).toBe(3_000);
  });

  test("blackjack: the hole card stays hidden, one hand at a time, money settles at the end", async () => {
    expect((await call("/blackjack/action", "POST", { action: "hit" })).data.error).toBe("noHand");
    for (let tries = 0; tries < 30; tries++) {
      const before = await net();
      const deal = await call("/blackjack/deal", "POST", { stake: 1_000 });
      expect(deal.status).toBe(200);
      let hand = deal.data.hand;
      if (hand.result) { expect(await net()).toBe(before + hand.result.payout - 1_000); continue; }
      expect(hand.dealer).toHaveLength(1);
      expect(JSON.stringify(deal.data)).not.toContain("shoe");
      expect((await call("/blackjack/deal", "POST", { stake: 1_000 })).data.error).toBe("handOpen");
      expect((await call("/blackjack/action", "POST", { action: "fly" })).data.error).toBe("invalidAction");
      while (!hand.result) {
        const a = await call("/blackjack/action", "POST", { action: "stand" });
        expect(a.status).toBe(200);
        hand = a.data.hand;
      }
      expect(hand.dealer.length).toBeGreaterThanOrEqual(2);
      expect(await net()).toBe(before + hand.result.payout - hand.result.staked);
      expect((await call("", "GET")).data.blackjack).toBeNull();
      return;
    }
    throw new Error("no playable hand in 30 deals");
  });

  test("poker: the buy-in leaves at the sit, the stack comes back at the leave", async () => {
    expect((await call("/poker/action", "POST", { action: { kind: "check" } })).data.error).toBe("noHand");
    expect((await call("/poker/sit", "POST", { buyIn: 500 })).data.error).toBe("invalidBuyIn");
    const before = await net();
    const sit = await call("/poker/sit", "POST", { buyIn: 10_000 });
    expect(sit.status).toBe(200);
    expect(await net()).toBe(before - 10_000);
    expect((await call("/poker/sit", "POST", { buyIn: 10_000 })).data.error).toBe("seated");
    let table = sit.data.view.poker;
    expect(table.seats[1].hole).toEqual([]);
    expect(JSON.stringify(sit.data.view)).not.toContain("deck");
    for (let i = 0; i < 40 && table; i++) {
      const action = table.street === "done" ? { kind: "next" } : table.legal?.canCheck ? { kind: "check" } : { kind: "call" };
      const r = await call("/poker/action", "POST", { action });
      expect(r.status).toBe(200);
      table = r.data.view.poker;
    }
    const stack = table ? table.seats[0].stack : 0;
    if (table) {
      const out = await call("/poker/leave", "POST", {});
      expect(out.status).toBe(200);
      expect(out.data.view.poker).toBeNull();
    }
    expect(await net()).toBe(before - 10_000 + stack);
  });
});
