import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { matchSetupFor } from "@/backend/matchSetup";
import { ownSolo, soloMeta } from "@/backend/testing/seatFixtures";
import type { Fixture } from "@/types/calendarTypes";

const CLUB = "33";

describe("matchSetupFor", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("answers what the /api/match-setup route answers", async () => {
    const created = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: CLUB, clubName: "Manchester United", clubColors: ["#da291c", "#000000"],
    });
    saveId = created.id;
    const { user, session } = devAutoLogin(`match-setup-for-${saveId}@test.local`);
    await ownSolo(saveId, user.id);

    let fixture: Fixture | null = null;
    for (let r = 1; r <= 38 && !fixture; r++) {
      const round = await saveService.getRound(saveId, "premier_league", r);
      fixture = round?.fixtures.find((f) => !f.played && (f.home === CLUB || f.away === CLUB)) ?? null;
    }
    expect(fixture).not.toBeNull();
    await saveService.updateMeta(saveId, { currentDate: fixture!.date });

    const res = await apiRoutes["/api/match-setup"](new Request(`http://localhost/api/match-setup?saveId=${saveId}&live=1`, {
      headers: { cookie: `fs_session=${session.token}` },
    }));
    expect(res.status).toBe(200);
    const route = await res.json() as Record<string, unknown>;

    const r = await matchSetupFor((await soloMeta(saveId))!, { live: true });
    expect(r.ok).toBe(true);
    for (const key of ["fixture", "myLineup", "myFormation", "oppFormation", "mySquadId", "matchDay", "seatOpponent"]) {
      expect(r.body[key]).toEqual(route[key]);
    }
    expect((r.body.fixture as Fixture).id).toBe(fixture!.id);

    // No game for the club on the day: same 400 from both.
    const noGame = new Date(Date.parse(`${fixture!.date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
    await saveService.updateMeta(saveId, { currentDate: noGame });
    const routeNo = await apiRoutes["/api/match-setup"](new Request(`http://localhost/api/match-setup?saveId=${saveId}`, {
      headers: { cookie: `fs_session=${session.token}` },
    }));
    const forNo = await matchSetupFor((await soloMeta(saveId))!, { live: false });
    if (routeNo.status !== 200) {
      expect(forNo.ok).toBe(false);
      expect(forNo.ok ? 200 : forNo.status).toBe(routeNo.status);
      expect(forNo.body).toEqual(await routeNo.json());
    }
  }, 120_000);
});
