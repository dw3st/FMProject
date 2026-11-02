import { afterAll, describe, expect, test } from "bun:test";
import { ownSolo } from "@/backend/testing/seatFixtures";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import type { ChampionTitle } from "@/Domain/champions/champions";
import type { ClubEntry } from "@/Domain/world/clubSearch";

describe("champions and club list routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("members only; clubs by their current league; titles with the manager of that day", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("champions-route@test.local");
    const other = devAutoLogin("champions-other@test.local");
    await ownSolo(saveId, user.id);

    const call = (key: string, url: string, token = session.token, method = "GET") => {
      const handler = (apiRoutes as unknown as Record<string, (r: Request) => Promise<Response>>)[key]!;
      const req = new Request(`http://localhost${url}`, { method, headers: { Cookie: `fs_session=${token}` } });
      return handler(Object.assign(req, { params: { saveId } }));
    };
    const clubsKey = "/api/saves/:saveId/clubs";
    const champsKey = "/api/saves/:saveId/champions";

    expect((await call(clubsKey, `/api/saves/${saveId}/clubs`, other.session.token)).status).toBe(404);
    expect((await call(champsKey, `/api/saves/${saveId}/champions`, other.session.token)).status).toBe(404);
    expect((await call(clubsKey, `/api/saves/${saveId}/clubs`, session.token, "POST")).status).toBe(405);

    const { clubs } = (await (await call(clubsKey, `/api/saves/${saveId}/clubs`)).json()) as { clubs: ClubEntry[] };
    expect(clubs.find((c) => c.id === "33")?.league).toBe("premier_league");
    expect(new Set(clubs.map((c) => c.id)).size).toBe(clubs.length);

    // A club moved to another league is listed there.
    await saveService.moveSquad(saveId, "33", "of_championship");
    const moved = (await (await call(clubsKey, `/api/saves/${saveId}/clubs`)).json()) as { clubs: ClubEntry[] };
    expect(moved.clubs.find((c) => c.id === "33")?.league).toBe("of_championship");

    const empty = (await (await call(champsKey, `/api/saves/${saveId}/champions`)).json()) as { titles: ChampionTitle[] };
    expect(empty.titles).toEqual([]);

    const managers = await saveService.getManagers(saveId);
    const human = managers.find((m) => m.seatId)!;
    const ai = managers.find((m) => !m.seatId && m.squadId === "50")!;
    const t = { season: "2026-27", kind: "league" as const, competition: "premier_league", points: 100 };
    await saveService.writeManagers(saveId, managers.map((m) =>
      m.id === human.id ? { ...m, titles: [{ ...t, squadId: "33" }, { ...t, kind: "promotion" as const, squadId: "33" }] }
      : m.id === ai.id ? { ...m, titles: [{ ...t, season: "2027-28", squadId: "50" }] }
      : m));

    const { titles } = (await (await call(champsKey, `/api/saves/${saveId}/champions`)).json()) as { titles: ChampionTitle[] };
    expect(titles).toHaveLength(2);
    expect(titles.find((x) => x.season === "2026-27")).toMatchObject({ squadId: "33", league: "of_championship", human: true, managerName: human.name });
    expect(titles.find((x) => x.season === "2027-28")).toMatchObject({ squadId: "50", human: false, nation: null, managerName: ai.name });
  }, 60_000);
});
