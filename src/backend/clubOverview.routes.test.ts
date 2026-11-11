import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import type { ClubOverview } from "@/types/clubOverviewTypes";

describe("GET /api/saves/:saveId/clubs/:squadId/overview (8.9.30)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("an AI club: manager, job security, stadium, money; the own club is not applicable; 404 and owner", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("club-overview@test.local");
    const other = devAutoLogin("club-overview-other@test.local");
    await ownSolo(saveId, user.id);

    const index = await saveService.getSquadIndex(saveId);
    const ai = index.inLeague("premier_league").find((t) => t.squadId !== "33")!;
    const handler = apiRoutes["/api/saves/:saveId/clubs/:squadId/overview" as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    const call = (squadId: string, token = session.token) => handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/clubs/${squadId}/overview`, { headers: { cookie: `fs_session=${token}` } }),
      { params: { saveId, squadId } },
    ));

    const res = await call(ai.squadId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClubOverview;
    expect(body.leagueSlug).toBe("premier_league");
    expect(body.manager?.name).toBeTruthy();
    expect(body.job?.blocked).toBeNull();
    expect(body.job?.level).not.toBeNull();
    expect(body.money?.tier).toBeTruthy();
    for (const v of [body.stadium.pitch, body.stadium.seats, body.stadium.structure]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(body.stadium.level).toBeGreaterThanOrEqual(1);

    const own = (await (await call("33")).json()) as ClubOverview;
    expect(own.job?.blocked).toBe("own");
    expect(own.money).toBeNull();

    expect((await call("nope_club")).status).toBe(404);
    expect((await call("../x")).status).toBe(404);
    expect((await call(ai.squadId, other.session.token)).status).toBe(404);
  }, 120_000);
});
