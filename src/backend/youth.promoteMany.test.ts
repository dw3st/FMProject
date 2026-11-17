import { ownSolo } from "@/backend/testing/seatFixtures";
import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { generateIntake } from "@/Domain/youth/youth";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/freeAgents";

describe("promoting several academy players (report 7da62af2)", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("promotes in order until the squad is full and says who did not fit", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("youth-promote-many@test.local");
    const seatId = await ownSolo(saveId, user.id);
    const squad = (await saveService.getSquadById(saveId, meta.clubId))!;
    const youth = generateIntake({ saveId, squad, year: 2027, nextSeasonEnd: "2028-05-31" });
    expect(youth.length).toBeGreaterThanOrEqual(3);
    // One place left under the cap.
    const filler = Array.from({ length: Math.max(0, HUMAN_MAX_SQUAD - 1 - squad.players.length) }, (_, i) => ({
      ...squad.players[0]!, id: `filler_${i}`,
    }));
    const players = [...squad.players, ...filler].slice(0, HUMAN_MAX_SQUAD - 1);
    await saveService.saveSquadById(saveId, { ...squad, players, youth });

    const call = (body: unknown) => {
      const handler = apiRoutes["/api/saves/:saveId/youth/promote-many" as keyof typeof apiRoutes] as unknown as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost/api/saves/${saveId}/youth/promote-many`, {
          method: "POST", headers: { cookie: `fs_session=${session.token}`, "content-type": "application/json" }, body: JSON.stringify(body),
        }),
        { params: { saveId } },
      ));
    };

    expect((await call({ ids: [] })).status).toBe(400);
    expect((await call({ ids: Array.from({ length: 51 }, (_, i) => `x${i}`) })).status).toBe(400);

    const [a, b] = [youth[0]!.id, youth[1]!.id];
    const res = await call({ ids: [a, "nobody", b] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { promoted: string[]; skipped: { id: string; reason: string }[] };
    expect(body.promoted).toEqual([a]);
    expect(body.skipped).toEqual([{ id: "nobody", reason: "notFound" }, { id: b, reason: "squadFull" }]);

    const after = (await saveService.getSquadById(saveId, meta.clubId))!;
    expect(after.players).toHaveLength(HUMAN_MAX_SQUAD);
    const moved = after.players.find((p) => p.id === a)!;
    expect(moved.arrival?.kind).toBe("academy");
    expect(after.youth?.some((p) => p.id === a)).toBe(false);
    expect(after.youth?.some((p) => p.id === b)).toBe(true);
    expect((await saveService.getAchievements(saveId, seatId)).promotedIds).toContain(a);
  }, 120_000);
});
