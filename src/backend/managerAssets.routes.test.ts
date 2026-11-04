import { afterAll, describe, expect, test } from "bun:test";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { apiRoutes } from "@/backend/routes";
import { saveService } from "@/backend/SaveService";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { ASSET_PRICES } from "@/Domain/managers/assets";

/** The manager's assets: his own money, level by level, and the club's balance never moves. */
describe("manager assets route", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("buy, no money, invalid, top level", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("manager-assets@test.local");
    const other = devAutoLogin("manager-assets-other@test.local");
    await ownSolo(saveId, user.id);
    const seatId = (await saveService.listSeats(saveId))[0]!.seatId;
    const budget = (await saveService.getSquadById(saveId, "33"))!.finances!.budget;

    const post = async (token: string, body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/manager-assets" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      const res = await handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/manager-assets`, {
          method: "POST", headers: { cookie: `fs_session=${token}`, "content-type": "application/json" }, body: JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
      return { status: res.status, data: await res.json() as Record<string, any> };
    };

    expect((await post(other.session.token, { kind: "car" })).status).toBe(404);
    expect((await post(session.token, { kind: "yacht" })).status).toBe(400);
    expect((await post(session.token, { kind: "car" })).data.error).toBe("noMoney");

    const total = ASSET_PRICES.car.reduce((a, b) => a + b, 0);
    await saveService.updateSeat(saveId, seatId, { managerEarnings: total });
    for (let i = 0; i < ASSET_PRICES.car.length; i++) expect((await post(session.token, { kind: "car" })).status).toBe(200);
    const seat = (await saveService.getSeat(saveId, seatId))!;
    expect(seat.managerAssets?.car).toBe(ASSET_PRICES.car.length);
    expect(seat.managerSpent).toBe(total);
    expect(seat.managerEarnings).toBe(total);
    expect((await post(session.token, { kind: "car" })).data.error).toBe("maxLevel");
    expect((await post(session.token, { kind: "watch" })).data.error).toBe("noMoney");
    expect((await saveService.getSquadById(saveId, "33"))!.finances!.budget).toBe(budget);
  }, 60_000);
});
