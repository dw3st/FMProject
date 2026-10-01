import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { contractDemand } from "@/Domain/contracts/contracts";
import { searchScout } from "@/backend/scoutSearch";
import { createDefaultScoutFilters } from "@/GameInterface/Scout/scoutFilterState";

describe("free agents: demand + sign routes and scout view", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("a free agent shows in the free scout view, asks a demand and signs for no fee", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("sign-route@test.local");
    recordSaveOwnership(saveId, user.id);

    const full = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    const squad = { ...full, players: full.players.slice(0, 25) };
    await saveService.saveSquad(saveId, meta.leagueSlug, meta.clubId, squad);
    const donor = squad.players.find((p) => p.age <= 28)!;
    const free = { ...donor, id: "free_test_1", name: "Free Tester", squadId: "", contract: undefined };
    await saveService.writeFreeAgents(saveId, [{ player: free, since: meta.currentDate! }]);

    const free1 = await searchScout(saveId, {
      filters: { ...createDefaultScoutFilters(), onlyFree: true }, sortKey: "avg", sortDir: "desc", page: 0, pageSize: 50,
    });
    expect(free1!.rows.map((r) => r.id)).toEqual(["free_test_1"]);
    const normal = await searchScout(saveId, {
      filters: createDefaultScoutFilters(), sortKey: "avg", sortDir: "desc", page: 0, pageSize: 50,
    });
    expect(normal!.rows.some((r) => r.free)).toBe(false);

    const req = (path: string, init: RequestInit, params: Record<string, string>) => Object.assign(
      new Request(`http://localhost${path}`, {
        ...init,
        headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" },
      }),
      { params },
    ) as Request & { params: Record<string, string> };

    const demandRes = await apiRoutes["/api/saves/:saveId/players/:playerId/demand"](
      req(`/api/saves/${saveId}/players/free_test_1/demand`, { method: "GET" }, { saveId, playerId: "free_test_1" }),
    );
    const { demand } = (await demandRes.json()) as { demand: number };
    expect(demand).toBe(contractDemand(free, squad, meta.currentDate!));

    const sign = (wage: number) => apiRoutes["/api/saves/:saveId/free-agents/:playerId/sign"](
      req(`/api/saves/${saveId}/free-agents/free_test_1/sign`, {
        method: "POST", body: JSON.stringify({ wage, years: 2 }),
      }, { saveId, playerId: "free_test_1" }),
    );
    const low = await sign(1);
    expect(low.status).toBe(400);
    expect(await low.json()).toMatchObject({ error: "lowWage" });

    const ok = await sign(demand);
    expect(ok.status).toBe(200);
    const after = (await saveService.getSquad(saveId, meta.leagueSlug, meta.clubId))!;
    const signed = after.players.find((p) => p.id === "free_test_1")!;
    expect(signed.contract!.wage).toBe(demand);
    expect(after.finances?.budget).toBe(squad.finances?.budget);
    expect(await saveService.getFreeAgents(saveId)).toEqual([]);
  }, 60_000);
});
