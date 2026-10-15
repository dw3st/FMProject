import { ownSolo } from "@/backend/testing/seatFixtures";
import { soloRecording } from "@/backend/testing/seatFixtures";
/**
 * Achievements (`.claude/rules/game/achievements.md`): the day step over a recorded match of the human club,
 * idempotency, the routes (owner, profile, stadium, shop) and the attributes copied to the club.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { advanceOneDay } from "@/backend/advanceDay";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { emptyAchievements } from "@/Domain/achievements/progress";
import { addDays } from "@/Domain/dates";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import type { Fixture } from "@/types/calendarTypes";
import type { RetiredPlayer } from "@/types/playerTypes";

const HUMAN = "33";

describe("achievements", () => {
  let saveId = "";
  let seatId = "";
  let fixture: Fixture;
  let token = "";
  let otherToken = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
    seatId = meta.seatId;
    const all = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    fixture = all
      .filter((f) => !f.played && (f.home === HUMAN || f.away === HUMAN) && f.date > addDays(meta.currentDate!, 3))
      .sort((a, b) => a.date.localeCompare(b.date))[0]!;
    const { user, session } = devAutoLogin("ach-route@test.local");
    token = session.token;
    otherToken = devAutoLogin("ach-other@test.local").session.token;
    await ownSolo(saveId, user.id);
  }, 180_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  const call = (path: string, method: string, auth: string, body?: unknown) => {
    const handler = apiRoutes[`/api/saves/:saveId/achievements${path}` as keyof typeof apiRoutes] as (r: Request) => Promise<Response>;
    return handler(Object.assign(
      new Request(`http://localhost/api/saves/${saveId}/achievements${path}`, {
        method,
        headers: { cookie: `fs_session=${auth}`, "content-type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }),
      { params: { saveId } },
    ));
  };

  test("a recorded comeback win counts, wins:bronze unlocks with an inbox message", async () => {
    // 49 wins already: today's win is the 50th.
    const s0 = emptyAchievements();
    await saveService.writeAchievements(saveId, { ...s0, counters: { ...s0.counters, wins: 49 } }, seatId);
    await saveService.updateMeta(saveId, { currentDate: fixture.date });
    const home = fixture.home === HUMAN;
    const squad = (await saveService.getSquadById(saveId, HUMAN))!;
    const scorer = squad.players.find((p) => p.positions[0] !== "GK")!.id;
    const opp = (await saveService.getSquadById(saveId, home ? fixture.away : fixture.home))!;
    const oppScorer = opp.players.find((p) => p.positions[0] !== "GK")!.id;
    const recording: PlayedMatchRecording = {
      fixtureId: fixture.id,
      score: home ? { home: 2, away: 1 } : { home: 1, away: 2 },
      teamStats: { home: {} as never, away: {} as never },
      playerStats: { [scorer]: { passesAttempted: 0, passesCompleted: 0, passesFailed: 0, shots: 2, goals: 2, assists: 0, interceptions: 0, tackles: 0 } },
      playerRatings: { [scorer]: 8 }, playerEnergy: {},
      substitutions: [], durationMs: 1,
      goals: [
        { playerId: oppScorer, team: home ? "away" : "home", minute: 10, header: false, distance: 10, outsideBox: false },
        { playerId: scorer, team: home ? "home" : "away", minute: 60, header: false, distance: 10, outsideBox: false },
        { playerId: scorer, team: home ? "home" : "away", minute: 92, header: false, distance: 10, outsideBox: false },
      ],
    };
    const out = await advanceOneDay(saveService, saveId, await soloRecording(saveId, recording));
    expect(out.ok).toBe(true);
    const state = await saveService.getAchievements(saveId, seatId);
    expect(state.lastDay).toBe(fixture.date);
    expect(state.counters.wins).toBe(50);
    expect(state.counters.matches).toBe(1);
    expect(state.counters.comebacks).toBe(1);
    expect(state.unlocked["secret:last_gasp"]).toBe(fixture.date);
    expect(state.unlocked["comebacks:bronze"]).toBe(fixture.date);
    expect(state.unlocked["wins:bronze"]).toBe(fixture.date);
    expect(state.attributes.motivation).toBeGreaterThan(10);
    // The attributes travel with the club.
    expect((await saveService.getSquadById(saveId, HUMAN))!.managerAttributes).toEqual(state.attributes);
    const inbox = await saveService.getInbox(saveId, seatId);
    expect(inbox.some((m) => m.category === "achievement" && m.keys.includes("wins:bronze"))).toBe(true);
  }, 300_000);

  test("routes: owner only, locked items refused, shop", async () => {
    expect((await call("", "GET", otherToken)).status).toBe(404);
    const v = await (await call("", "GET", token)).json() as any;
    expect(v.tracks).toHaveLength(27);
    expect(v.secrets).toHaveLength(17);
    expect(v.secrets.every((s: any) => s.unlocked === undefined || typeof s.unlocked === "string")).toBe(true);

    expect((await call("/profile", "PUT", token, { frame: "legend" })).status).toBe(400);
    expect((await call("/stadium", "PUT", token, { mosaic: true })).status).toBe(400);
    expect((await call("/shop/created", "POST", token, { name: "Joe Test", position: "ST", nationality: "England", foot: "left" })).status).toBe(409);

    // Enough points: a lot of golds.
    const st = await saveService.getAchievements(saveId, seatId);
    const unlocked = { ...st.unlocked };
    for (const t of ["wins", "comebacks", "league_titles", "cup_titles", "youth_promoted", "balance", "seasons", "top_scorer", "thrashings", "derby_wins", "promotions", "clubs", "stadium", "big_signing", "sales_profit", "free_starter", "facilities", "ranking", "win_streak", "unbeaten_run"] as const) {
      for (const tier of ["bronze", "silver", "gold"] as const) unlocked[`${t}:${tier}`] = "2027-01-01";
    }
    await saveService.writeAchievements(saveId, { ...st, unlocked }, seatId);

    const p = await call("/profile", "PUT", token, { frame: "legend", badges: ["wins", "titles"], title: "comebacks" });
    expect(p.status).toBe(200);
    expect(((await p.json()) as any).profile).toEqual({ frame: "legend", badges: ["wins", "titles"], title: "comebacks" });
    expect((await call("/stadium", "PUT", token, { banner: true, flag: true, mosaic: true })).status).toBe(200);
    expect((await call("/profile", "PUT", token, { badges: ["wins", "wins"] })).status).toBe(400);

    const created = await call("/shop/created", "POST", token, { name: "Joe Test", position: "ST", nationality: "England", foot: "left" });
    expect(created.status).toBe(200);
    const body = await created.json() as any;
    expect(body.player.age).toBe(16);
    expect(body.points.spent).toBe(300);
    const squad = (await saveService.getSquadById(saveId, HUMAN))!;
    expect(squad.youth?.some((y) => y.id === body.player.id && y.name === "Joe Test")).toBe(true);
    expect((await call("/shop/created", "POST", token, { name: "Joe Two", position: "ST", nationality: "England", foot: "left" })).status).toBe(409);

    // The legend: three retired stars drawn once, one comes back at 17.
    const retired: RetiredPlayer[] = Array.from({ length: 5 }, (_, i) => ({
      id: `ret_${i}`, name: `Old Star ${i}`, nationality: "Brazil", positions: ["ST"], preferredFoot: "right",
      profile: { summary: "", archetype: "Poacher" }, retiredOn: "2026-12-01", squadId: "40", age: 37,
      wasWorldClass: i < 2, statsAtRetirement: squad.players[0]!.stats, appearances: 400, goals: 200,
    } as RetiredPlayer));
    await saveService.writeRetired(saveId, retired);
    const draw = await call("/shop/legend/draw", "POST", token);
    expect(draw.status).toBe(200);
    const legends = ((await draw.json()) as any).shop.legends;
    expect(legends).toHaveLength(3);
    const again = await call("/shop/legend/draw", "POST", token);
    expect(((await again.json()) as any).shop.legends.map((l: any) => l.id)).toEqual(legends.map((l: any) => l.id));
    expect((await call("/shop/legend", "POST", token, { retiredId: "not_offered" })).status).toBe(400);
    const pick = await call("/shop/legend", "POST", token, { retiredId: legends[0].id });
    expect(pick.status).toBe(200);
    const picked = await pick.json() as any;
    expect(picked.player.age).toBe(17);
    expect(picked.player.reborn.fromId).toBe(legends[0].id);
    expect(picked.points.spent).toBe(800);
    expect((await call("/shop/legend/draw", "POST", token)).status).toBe(409);
  }, 120_000);
});
