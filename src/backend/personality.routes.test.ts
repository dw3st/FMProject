import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { tierStepsDown } from "@/Domain/personality/personality";
import type { SaveMeta } from "@/backend/SaveService";
import type { Squad } from "@/types/playerTypes";

type Params = Record<string, string>;
const income = (s: Squad) => (s.finances?.broadcasting ?? 0) + (s.finances?.commercial ?? 0);

/**
 * Personality on the contract routes (`.claude/rules/game/personality.md`): a very ambitious player
 * of a much bigger club refuses the human club (free agent signing and purchase), and the demand
 * route explains the parts.
 */
describe("personality: smaller-club refusal on the routes", () => {
  let meta: SaveMeta;
  let saveId = "";
  let token = "";
  let elite: Squad;

  const req = (path: string, method: string, params: Params, body?: unknown) => Object.assign(
    new Request(`http://localhost${path}`, {
      method,
      headers: { cookie: `fs_session=${token}`, "content-type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
    { params },
  ) as Request & { params: Params };
  const route = (key: string) => (apiRoutes as unknown as Record<string, (r: Request & { params: Params }) => Promise<Response>>)[key]!;

  beforeAll(async () => {
    process.env.FM_NO_RIVALS = "1";
    // The poorest Championship club: the human side, two or more natural tiers below the world's richest club.
    const dir = fileURLToPath(new URL("../example_data/squads/of_championship/", import.meta.url));
    const champ = await Promise.all(readdirSync(dir).filter((f) => f.endsWith(".json"))
      .map(async (f) => (await Bun.file(`${dir}${f}`).json()) as Squad));
    const small = champ.sort((a, b) => income(a) - income(b))[0]!;
    meta = await saveService.createSave({
      leagueSlug: "of_championship", leagueName: "Championship",
      clubId: small.id, clubName: small.name, clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    const { user, session } = devAutoLogin("personality-route@test.local");
    token = session.token;
    recordSaveOwnership(saveId, user.id);
    const files = await saveService.listSquadFiles(saveId);
    elite = files.map(({ squad }) => squad).sort((a, b) => income(b) - income(a))[0]!;
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    await saveService.saveSquadById(saveId, { ...human, players: human.players.slice(0, 25), finances: { ...human.finances!, budget: 5_000_000_000 } });
  }, 120_000);

  afterAll(async () => {
    delete process.env.FM_NO_RIVALS;
    if (saveId) await saveService.deleteSave(saveId);
  });

  test("free agent and purchase: an ambitious star of a much bigger club refuses (400 smallerClub)", async () => {
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    expect(tierStepsDown(elite, human)).toBeGreaterThanOrEqual(2);
    const ambitious = { ambition: 20, loyalty: 5, professionalism: 10, temperament: 10 };

    // Free agent whose last club is the elite one.
    const donor = elite.players.find((p) => p.age <= 28 && !p.loan)!;
    const free = {
      ...donor, id: "free_ambitious", name: "Ambitious Free", squadId: "", contract: undefined, personality: ambitious,
      history: [{ season: "2025-26", squadId: elite.id, clubName: elite.name, league: elite.leagueSlug ?? "", apps: 30, goals: 1, assists: 1, avgRating: 6.8, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, titles: [] }],
    };
    await saveService.writeFreeAgents(saveId, [{ player: free, since: meta.currentDate! }]);
    const demandRes = await route("/api/saves/:saveId/players/:playerId/demand")(
      req(`/api/saves/${saveId}/players/free_ambitious/demand`, "GET", { saveId, playerId: "free_ambitious" }),
    );
    const d = (await demandRes.json()) as { demand: number; ambition: number; smallerClub: number; refusesSmallerClub: boolean };
    expect(d.refusesSmallerClub).toBe(true);
    expect(d.ambition).toBeCloseTo(1.08);
    expect(d.smallerClub).toBeGreaterThan(1);
    const sign = await route("/api/saves/:saveId/free-agents/:playerId/sign")(
      req(`/api/saves/${saveId}/free-agents/free_ambitious/sign`, "POST", { saveId, playerId: "free_ambitious" }, { wage: d.demand * 10, years: 2 }),
    );
    expect(sign.status).toBe(400);
    expect(await sign.json()).toMatchObject({ error: "smallerClub" });

    // Purchase of a player of the elite club with the same personality.
    const target = elite.players.find((p) => !p.loan && p.id !== donor.id)!;
    await saveService.saveSquadById(saveId, {
      ...elite, players: elite.players.map((p) => (p.id === target.id ? { ...p, personality: ambitious } : p)),
    });
    const buy = await route("/api/saves/:saveId/transfers")(
      req(`/api/saves/${saveId}/transfers`, "POST", { saveId }, { playerId: target.id, fromSquadId: elite.id, fee: 900_000_000, wage: 50_000_000, years: 2 }),
    );
    expect(buy.status).toBe(400);
    expect(await buy.json()).toMatchObject({ error: "smallerClub" });
  }, 120_000);
});
