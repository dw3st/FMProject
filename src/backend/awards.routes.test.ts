import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import type { AwardsYear, LeagueSeasonAwards } from "@/types/awardTypes";

function league(slug: string, season: string): LeagueSeasonAwards {
  return {
    league: slug, season, closedOn: "2027-05-20", country: "England", tier: 1, weight: 1,
    teamOfSeason: [], shortlist: { players: [], managers: [] },
  };
}

describe("GET /api/saves/:saveId/awards", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner only, validates the year, 404 without a file, latest year by default", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("awards-route@test.local");
    const other = devAutoLogin("awards-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const key = "/api/saves/:saveId/awards";
    const call = (qs: string, token: string | null = session.token) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      const headers: Record<string, string> = token ? { cookie: `fs_session=${token}` } : {};
      return handler(Object.assign(new Request(`http://localhost/api/saves/${saveId}/awards${qs}`, { headers }), { params: { saveId } }));
    };

    expect((await call("", null)).status).toBe(401);
    expect((await call("", other.session.token)).status).toBe(404);
    expect((await call("?year=abc")).status).toBe(400);
    expect((await call("?year=99999")).status).toBe(400);
    // No file yet.
    expect((await call("")).status).toBe(404);

    const y2027: AwardsYear = { year: 2027, leagues: [league("premier_league", "2026-27")] };
    const y2028: AwardsYear = {
      year: 2028, leagues: [league("premier_league", "2027-28")],
      world: { year: 2028, on: "2029-01-01", player: [], manager: [] },
    };
    await saveService.writeAwardsYear(saveId, y2028);
    await saveService.writeAwardsYear(saveId, y2027);

    const latest = (await (await call("")).json()) as { years: number[]; year: number; leagues: LeagueSeasonAwards[]; world: unknown };
    expect(latest.years).toEqual([2027, 2028]);
    expect(latest.year).toBe(2028);
    expect(latest.leagues[0]!.season).toBe("2027-28");
    expect(latest.world).toEqual(y2028.world!);

    const first = (await (await call("?year=2027")).json()) as { year: number; world: unknown };
    expect(first.year).toBe(2027);
    expect(first.world).toBeNull();
    expect((await call("?year=2030")).status).toBe(404);
  }, 60_000);
});
