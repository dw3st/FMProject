import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { generateIntake } from "@/Domain/youth/youth";

describe("releasing several academy players", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("the chosen ones go to the free pool, the others stay; a bad list is refused", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("youth-many@test.local");
    await ownSolo(saveId, user.id);
    const squad = (await saveService.getSquadById(saveId, meta.clubId))!;
    const youth = generateIntake({ saveId, squad, year: 2027, nextSeasonEnd: "2028-05-31" });
    await saveService.saveSquadById(saveId, { ...squad, youth });

    const call = (body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/youth/release-many" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/youth/release-many`, {
          method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" }, body: JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
    };

    expect((await call({ ids: [] })).status).toBe(400);
    expect((await call({ ids: [1] })).status).toBe(400);
    const leaving = youth.slice(0, 2).map((p) => p.id);
    expect((await call({ ids: leaving })).status).toBe(200);
    const after = (await saveService.getSquadById(saveId, meta.clubId))!;
    expect(after.youth).toHaveLength(youth.length - 2);
    const pool = new Set((await saveService.getFreeAgents(saveId)).map((f) => f.player.id));
    for (const id of leaving) expect(pool.has(id)).toBe(true);
  }, 120_000);
});
