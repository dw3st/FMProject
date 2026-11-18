import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { generateIntake } from "@/Domain/youth/youth";
import { autoReleaseValue } from "@/Domain/youth/autoRelease";

describe("academy release rule", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("setting the rule releases who is below it and keeps the rule; null turns it off", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("youth-auto@test.local");
    await ownSolo(saveId, user.id);
    const squad = (await saveService.getSquadById(saveId, meta.clubId))!;
    const youth = generateIntake({ saveId, squad, year: 2027, nextSeasonEnd: "2028-05-31" });
    await saveService.saveSquadById(saveId, { ...squad, youth });
    const call = (body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/youth/auto-release" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      return handler(Object.assign(new Request(`http://localhost/api/saves/${saveId}/youth/auto-release`, {
        method: "PUT", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" }, body: JSON.stringify(body),
      }), { params: { saveId } }));
    };
    expect((await call({ rule: { by: "nope", below: 5 } })).status).toBe(400);
    const values = youth.map((p) => autoReleaseValue(p, "level")).sort((a, b) => a - b);
    const cut = values[Math.floor(values.length / 2)]!;
    const res = await call({ rule: { by: "level", below: cut } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { released: string[]; autoRelease: unknown };
    expect(body.autoRelease).toEqual({ by: "level", below: cut });
    const after = (await saveService.getSquadById(saveId, meta.clubId))!;
    expect(after.youth!.every((p) => autoReleaseValue(p, "level") >= cut)).toBe(true);
    expect(after.youth!.length + body.released.length).toBe(youth.length);
    expect((await call({ rule: null })).status).toBe(200);
    expect((await saveService.getSquadById(saveId, meta.clubId))!.youthAutoRelease).toBeUndefined();
  }, 120_000);
});
