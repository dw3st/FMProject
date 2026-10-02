import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";

type Page = {
  total: number; playerRank: number | null;
  items: { rank: number; id: string; isPlayer: boolean; points: number; clubName: string | null; squadId: string }[];
};

describe("GET /api/saves/:saveId/managers", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner only, validates params, ranks world and country, pages", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("managers-route@test.local");
    const other = devAutoLogin("managers-other@test.local");
    recordSaveOwnership(saveId, user.id);

    // Give one English AI manager and one foreign manager points.
    const managers = await saveService.getManagers(saveId);
    const index = await saveService.getSquadIndex(saveId);
    const english = managers.find((m) => !m.isPlayer && index.byId(m.squadId)?.leagueSlug === "premier_league")!;
    const foreign = managers.find((m) => index.byId(m.squadId)?.leagueSlug === "la_liga")!;
    const t = { season: "2026-27", kind: "league" as const, competition: "x", squadId: "", points: 0 };
    await saveService.writeManagers(saveId, managers.map((m) =>
      m.id === english.id ? { ...m, points: 100, titles: [{ ...t, squadId: m.squadId, points: 100 }] }
      : m.id === foreign.id ? { ...m, points: 150, titles: [{ ...t, squadId: m.squadId, points: 150 }] }
      : m));

    const key = "/api/saves/:saveId/managers";
    const call = (qs: string, token = session.token) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/managers${qs}`, { headers: { cookie: `fs_session=${token}` } }),
        { params: { saveId } },
      ));
    };
    expect((await call("", other.session.token)).status).toBe(404);
    expect((await call("?scope=planet")).status).toBe(400);
    expect((await call("?limit=0")).status).toBe(400);
    expect((await call("?offset=-1")).status).toBe(400);

    const world = (await (await call("?scope=world&limit=3")).json()) as Page;
    expect(world.total).toBe(managers.length);
    expect(world.items.map((m) => m.id)).toEqual([foreign.id, english.id, world.items[2]!.id]);
    expect(world.items.map((m) => m.rank)).toEqual([1, 2, 3]);
    expect(typeof world.items[0]!.clubName).toBe("string");
    expect(world.playerRank).toBeGreaterThan(2);

    const country = (await (await call("?scope=country&offset=0&limit=100")).json()) as Page;
    expect(country.total).toBeLessThan(world.total);
    expect(country.items[0]!.id).toBe(english.id);
    expect(country.items.some((m) => m.id === foreign.id)).toBe(false);
    expect(country.items.some((m) => m.isPlayer)).toBe(true);
    expect(country.playerRank).not.toBeNull();

    const second = (await (await call("?offset=1&limit=1")).json()) as Page;
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!).toMatchObject({ id: english.id, rank: 2 });
  }, 60_000);
});
