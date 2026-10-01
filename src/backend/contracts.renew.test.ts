import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { contractDemand } from "@/Domain/contracts/contracts";

describe("POST /api/saves/:saveId/players/:playerId/renew", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("refuses a low wage with the demand, accepts the demand and extends the contract", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("renew-route@test.local");
    recordSaveOwnership(saveId, user.id);

    const squad = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    const player = [...squad.players].filter((p) => p.age <= 26 && p.contract).sort((x, y) => x.contract!.until.localeCompare(y.contract!.until))[0]!;
    const demand = contractDemand(player, squad, meta.currentDate!);
    const handler = apiRoutes["/api/saves/:saveId/players/:playerId/renew"];
    const call = (wage: number, years: number) => handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/players/${player.id}/renew`, {
        method: "POST",
        headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
        body: JSON.stringify({ wage, years }),
      }),
      { params: { saveId, playerId: player.id } },
    ) as Request & { params: Record<string, string> });

    const low = await call(1, 3);
    expect(low.status).toBe(400);
    expect(await low.json()).toMatchObject({ error: "lowWage", demand });

    const tooLong = await call(demand, 5);
    expect(tooLong.status).toBe(400);
    expect(await tooLong.json()).toMatchObject({ error: "tooManyYears" });

    const ok = await call(demand, 1);
    expect(ok.status).toBe(200);
    const after = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!.players.find((p) => p.id === player.id)!;
    expect(after.contract!.wage).toBe(demand);
    expect(after.contract!.until > player.contract!.until).toBe(true);
  }, 60_000);
});
