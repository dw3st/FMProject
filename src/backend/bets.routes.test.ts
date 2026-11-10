/** The manager's bets (`.claude/rules/game/bets.md`): the route, the wallet and the settling in the day advance. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import type { Bet, BetsView } from "@/types/betTypes";
import type { Fixture } from "@/types/calendarTypes";

const HUMAN = "33";

describe("bets", () => {
  let saveId = "";
  let seatId = "";
  let token = "";
  const call = async (method: string, body?: unknown) => {
    const handler = apiRoutes["/api/saves/:saveId/bets" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
    const res = await handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/bets`, {
        method, headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      { params: { saveId } },
    ));
    return { status: res.status, data: await res.json() as BetsView & { error?: string } };
  };

  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("bets@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
    seatId = (await saveService.listSeats(saveId))[0]!.seatId;
    await saveService.updateSeat(saveId, seatId, { managerEarnings: 1_000_000 });
  }, 270_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("lists the week's games, takes a bet, refuses a repeat, a changed price and a stake over the limit", async () => {
    const before = (await call("GET")).data;
    expect(before.wallet).toBe(1_000_000);
    expect(before.maxStake).toBe(100_000);
    expect(before.games.length).toBeGreaterThan(0);
    const game = before.games.find((g) => !g.own)!;
    const r = game.markets.result[0]!;
    const s = game.markets.scores[0]!;
    const base = { competition: game.competition, fixtureId: game.fixtureId, pick: { market: "result", side: r.side }, stake: 50_000 };

    expect((await call("POST", { ...base, odds: r.odds + 1 })).data.error).toBe("oddsChanged");
    expect((await call("POST", { ...base, odds: r.odds })).status).toBe(200);
    expect((await call("POST", { ...base, odds: r.odds })).data.error).toBe("alreadyBet");
    expect((await call("POST", { competition: game.competition, fixtureId: game.fixtureId, pick: { market: "score", home: s.home, away: s.away }, stake: 500_000, odds: s.odds })).status).toBe(409);

    const after = (await call("GET")).data;
    expect(after.wallet).toBe(950_000);
    expect(after.openTotal).toBe(50_000);
    expect(after.open).toHaveLength(1);
  }, 120_000);

  test("the day settles the bet on the game played, moves the wallet and writes to the inbox", async () => {
    const date = (await saveService.getMeta(saveId))!.currentDate!;
    const idx = (await saveService.getDateIndex(saveId, "of_championship"))!;
    const day = Object.keys(idx).filter((d) => d >= date).sort()[0]!;
    const round = await saveService.getRound(saveId, "of_championship", idx[day]![0]!);
    const fixture = (round!.fixtures as Fixture[]).find((f) => f.date === day)!;

    const placed: Bet = {
      id: "t1", placedOn: date, competition: "of_championship", fixtureId: fixture.id, date: day,
      home: fixture.home, away: fixture.away, homeName: "H", awayName: "A",
      pick: { market: "score", home: 99, away: 99 }, stake: 1_000, odds: 50,
    };
    const state = await saveService.getBets(saveId, seatId);
    await saveService.writeBets(saveId, { ...state, open: [placed] }, seatId);
    await saveService.updateMeta(saveId, { currentDate: day });

    const out = await advanceOneDay(saveService, saveId);
    expect(out.ok).toBe(true);

    const bets = await saveService.getBets(saveId, seatId);
    expect(bets.open).toHaveLength(0);
    expect(bets.settled[0]!.status).toBe("lost");
    expect((await saveService.getSeatMeta(saveId, seatId))!.betNet).toBe(-1_000);
    const inbox = await saveService.getInbox(saveId, seatId);
    expect(inbox.some((m) => m.category === "bets")).toBe(true);
  }, 240_000);
});
