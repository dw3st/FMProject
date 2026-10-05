import { afterAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { generateIntake } from "@/Domain/youth/youth";
import { HUMAN_MAX_SQUAD } from "@/Domain/contracts/freeAgents";

describe("youth routes", () => {
  let saveId = "";
  afterAll(async () => {
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("owner check, list, promote (limit HUMAN_MAX_SQUAD), release to the free pool", async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("youth-route@test.local");
    const other = devAutoLogin("youth-other@test.local");
    recordSaveOwnership(saveId, user.id);

    const call = (key: string, path: string, method: string, token: string) => {
      const handler = apiRoutes[key as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
      return handler(Object.assign(
        new Request(`http://localhost${path}`, { method, headers: { cookie: `fs_session=${token}` } }),
        { params: { saveId, playerId: path.split("/")[5] ?? "" } },
      ));
    };

    const ref = (await saveService.resolveSquadId(saveId, meta.clubId))!;
    const full0 = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    const squad = { ...full0, players: full0.players.slice(0, 25) };
    const intake = generateIntake({ saveId, squad, year: 2027, nextSeasonEnd: "2028-05-31" });
    await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, { ...squad, youth: intake });

    expect((await call("/api/saves/:saveId/youth", `/api/saves/${saveId}/youth`, "GET", other.session.token)).status).toBe(404);
    const list = await (await call("/api/saves/:saveId/youth", `/api/saves/${saveId}/youth`, "GET", session.token)).json() as any;
    expect(list.youth).toHaveLength(intake.length);
    expect(list.youth[0].potential.high).toBeGreaterThan(list.youth[0].overall);

    const promoteKey = "/api/saves/:saveId/youth/:playerId/promote";
    const releaseKey = "/api/saves/:saveId/youth/:playerId/release";
    const pId = intake[0]!.id;
    const rId = intake[1]!.id;

    expect((await call(promoteKey, `/api/saves/${saveId}/youth/nope/promote`, "POST", session.token)).status).toBe(404);

    // Release: leaves the academy and enters the free-agent pool.
    expect((await call(releaseKey, `/api/saves/${saveId}/youth/${rId}/release`, "POST", session.token)).status).toBe(200);
    expect((await saveService.getFreeAgents(saveId)).some((f) => f.player.id === rId)).toBe(true);

    // Promote: moves to the squad with a contract.
    const size = squad.players.length;
    const res = await call(promoteKey, `/api/saves/${saveId}/youth/${pId}/promote`, "POST", session.token);
    expect(res.status).toBe(200);
    const after = (await saveService.getSquad(saveId, ref.leagueSlug, ref.clubSlug))!;
    expect(after.players.length).toBe(size + 1);
    expect(after.players.find((p) => p.id === pId)?.contract?.wage).toBeGreaterThan(0);
    expect(after.youth!.some((p) => p.id === pId)).toBe(false);

    // Squad limit: a full squad refuses.
    const filler = Array.from({ length: HUMAN_MAX_SQUAD - after.players.length }, (_, i) => ({ ...after.players[i % after.players.length]!, id: `fill_${i}` }));
    const stuffed = { ...after, players: [...after.players, ...filler] };
    await saveService.saveSquad(saveId, ref.leagueSlug, ref.clubSlug, stuffed);
    const thirdId = intake[2]!.id;
    const full = await call(promoteKey, `/api/saves/${saveId}/youth/${thirdId}/promote`, "POST", session.token);
    expect(full.status).toBe(400);
    expect(((await full.json()) as any).error).toBe("squadFull");
  }, 60_000);
});
