import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { swapValue } from "@/Domain/negotiation/swap";
import type { SeatMeta } from "@/backend/SaveService";

type Params = Record<string, string>;

describe("swap in a purchase (9.4)", () => {
  let meta: SeatMeta;
  let saveId = "";
  let token = "";
  const req = (body: unknown) => Object.assign(
    new Request(`http://localhost/api/saves/${saveId}/transfers`, {
      method: "POST", headers: { cookie: `fs_session=${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: { saveId } },
  ) as Request & { params: Params };
  const post = async (body: unknown) => {
    const res = await (apiRoutes as unknown as Record<string, (r: Request) => Promise<Response>>)["/api/saves/:saveId/transfers"]!(req(body));
    return { status: res.status, data: await res.json() as Record<string, any> };
  };

  beforeAll(async () => {
    process.env.FM_NO_RIVALS = "1";
    meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("swap-route@test.local");
    token = session.token;
    await ownSolo(saveId, user.id);
    const sq = (await saveService.getSquadById(saveId, "33"))!;
    await saveService.saveSquadById(saveId, { ...sq, players: sq.players.slice(0, 26), finances: { ...sq.finances!, budget: 0 } });
  }, 120_000);

  afterAll(async () => {
    delete process.env.FM_NO_RIVALS;
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("a richer swap buys the player with no money; then the AI club pays a difference", async () => {
    const clubs = (await saveService.getSquadsInLeague(saveId, meta.leagueSlug)).filter((s) => s.id !== "33" && s.players.length >= 22);
    const seller = clubs[0]!;
    const target = [...seller.players].filter((p) => !p.loan).sort((a, b) => playerMarketValue(a) - playerMarketValue(b))[3]!;
    const human = (await saveService.getSquadById(saveId, "33"))!;
    const swap = [...human.players].sort((a, b) => playerMarketValue(b) - playerMarketValue(a))[0]!;

    expect((await post({ playerId: target.id, fromSquadId: seller.id, fee: 0 })).status).toBe(400);
    expect((await post({ playerId: target.id, fromSquadId: seller.id, fee: 0, swapPlayerId: "nobody" })).data.error).toBe("swapInvalid");
    expect((await post({ playerId: target.id, fromSquadId: seller.id, fee: -10_000_000_000, swapPlayerId: swap.id })).status).toBe(400);

    const res = await post({ playerId: target.id, fromSquadId: seller.id, fee: 0, swapPlayerId: swap.id });
    expect(res.status).toBe(200);
    expect(res.data.response.kind).toBe("accept");
    expect(res.data.swapValue).toBeGreaterThan(0);
    const humanAfter = (await saveService.getSquadById(saveId, "33"))!;
    const sellerAfter = (await saveService.getSquadById(saveId, seller.id))!;
    expect(humanAfter.players.some((p) => p.id === target.id)).toBe(true);
    expect(humanAfter.players.some((p) => p.id === swap.id)).toBe(false);
    expect(sellerAfter.players.some((p) => p.id === swap.id)).toBe(true);
    expect(humanAfter.finances!.budget).toBe(0);
    expect(swapValue(swap, undefined)).toBeLessThanOrEqual(res.data.swapValue);

    // Second deal: the club gets a valuable player for a cheap one and pays €100k on top.
    const seller2 = clubs[1]!;
    const cheap = [...seller2.players].filter((p) => !p.loan).sort((a, b) => playerMarketValue(a) - playerMarketValue(b))[2]!;
    const swap2 = [...humanAfter.players].filter((p) => p.id !== target.id).sort((a, b) => playerMarketValue(b) - playerMarketValue(a))[0]!;
    const res2 = await post({ playerId: cheap.id, fromSquadId: seller2.id, fee: -100_000, swapPlayerId: swap2.id });
    expect(res2.data.response.kind).toBe("accept");
    expect((await saveService.getSquadById(saveId, "33"))!.finances!.budget).toBe(100_000);
  }, 120_000);
});
