import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { tierStepsDown } from "@/Domain/personality/personality";
import { makeProfessional } from "@/Domain/staff/staff";
import { emptyMarket } from "@/backend/negotiationWorld";
import type { SaveMeta } from "@/backend/SaveService";
import { emptySeasonLog, type Squad } from "@/types/playerTypes";

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

  /**
   * The human club's chief scout and what the manager knows of the free agent
   * (`.claude/rules/game/scouting.md`): 10 = fully observed (exact view), 1 = never observed (very unsure).
   */
  async function setScout(rating: number) {
    const h = (await saveService.getSquadById(saveId, meta.clubId))!;
    // Old 1..10 rating -> stars (10 = 5 stars, 1 = 1 star).
    const chief = makeProfessional(`t:${rating}`, "scout", rating >= 10 ? 5 : 1);
    const others = (h.staff?.members ?? []).filter((m) => m.role !== "scout");
    await saveService.saveSquadById(saveId, { ...h, staff: { ...(h.staff ?? { members: [] }), members: [...others, chief] } });
    const s = await saveService.getScouting(saveId);
    const knowledge = { ...s.knowledge };
    if (rating >= 10) knowledge.free_ambitious = { k: 100, seen: meta.currentDate! };
    else delete knowledge.free_ambitious;
    await saveService.writeScouting(saveId, { ...s, knowledge });
  }

  test("free agent and purchase: an ambitious star of a much bigger club refuses (400 smallerClub)", async () => {
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    expect(tierStepsDown(elite, human)).toBeGreaterThanOrEqual(2);
    const ambitious = { ambition: 20, loyalty: 5, professionalism: 10, temperament: 10 };

    // Free agent whose last club is the elite one.
    const donor = elite.players.find((p) => p.age <= 28 && !p.loan)!;
    const free = {
      ...donor, id: "free_ambitious", name: "Ambitious Free", squadId: "", contract: undefined, personality: ambitious,
      history: [{ season: "2025-26", squadId: elite.id, clubName: elite.name, league: elite.leagueSlug ?? "", apps: 30, goals: 1, assists: 1, avgRating: 6.8, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [] }],
    };
    await saveService.writeFreeAgents(saveId, [{ player: free, since: meta.currentDate! }]);
    await setScout(10);
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

    // A very unsure chief scout: the demand stays real, the personality parts are not revealed.
    await setScout(1);
    const blurred = (await (await route("/api/saves/:saveId/players/:playerId/demand")(
      req(`/api/saves/${saveId}/players/free_ambitious/demand`, "GET", { saveId, playerId: "free_ambitious" }),
    )).json()) as Record<string, unknown>;
    expect(blurred.demand).toBe(d.demand);
    expect(blurred.ambition).toBeUndefined();
    expect(blurred.refusesSmallerClub).toBeUndefined();

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

  test("one of ours out on loan renews as our own player (loyalty, no smaller-club rule), same on demand and renew", async () => {
    const human = (await saveService.getSquadById(saveId, meta.clubId))!;
    const lent = human.players.find((p) => !p.loan && p.contract && p.age <= 28)!;
    const loyal = { ambition: 20, loyalty: 20, professionalism: 10, temperament: 10 };
    const history = ["2023-24", "2024-25", "2025-26"].map((season) => ({
      season, squadId: human.id, clubName: human.name, league: meta.leagueSlug, apps: 30, goals: 0, assists: 0, avgRating: 6.5,
      cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [],
    }));
    // Move him to the elite club on loan (an elite holder: a smaller-club premium would show if misapplied).
    const moved = { ...lent, squadId: elite.id, personality: loyal, history, seasonLog: emptySeasonLog(), contract: { ...lent.contract!, until: "2027-05-31" }, loan: { fromClubId: human.id, fromClubName: human.name, until: "2099-01-01", wageShare: 1 } };
    await saveService.saveSquadById(saveId, { ...human, players: human.players.filter((p) => p.id !== lent.id) });
    const holder = (await saveService.getSquadById(saveId, elite.id))!;
    await saveService.saveSquadById(saveId, { ...holder, players: [...holder.players, moved] });
    const market = (await saveService.getMarket(saveId)) ?? emptyMarket();
    await saveService.saveMarket(saveId, { ...market, loans: [...(market.loans ?? []), {
      playerId: lent.id, playerName: lent.name, fromClubId: human.id, fromClubName: human.name, toClubId: elite.id, toClubName: elite.name,
      until: "2099-01-01", wageShare: 1, wage: lent.contract!.wage, fee: 0, start: meta.currentDate!,
    }] });

    const d = (await (await route("/api/saves/:saveId/players/:playerId/demand")(
      req(`/api/saves/${saveId}/players/${lent.id}/demand?from=${elite.id}`, "GET", { saveId, playerId: lent.id }),
    )).json()) as { demand: number; loyalty?: number; smallerClub?: number; refusesSmallerClub?: boolean };
    expect(d.loyalty).toBeCloseTo(0.925); // 3 history seasons of 4 (the log is empty: no current season)
    expect(d.smallerClub).toBeUndefined();
    expect(d.refusesSmallerClub).toBeUndefined();
    const renew = await route("/api/saves/:saveId/players/:playerId/renew")(
      req(`/api/saves/${saveId}/players/${lent.id}/renew`, "POST", { saveId, playerId: lent.id }, { wage: d.demand, years: 1 }),
    );
    expect(renew.status).toBe(200);
    expect(((await renew.json()) as { demand: number }).demand).toBe(d.demand);
  }, 120_000);
});
