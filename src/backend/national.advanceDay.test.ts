/**
 * National teams in the day pipeline (`.claude/rules/game/national-teams.md`): the world is created with the
 * career, a FIFA window calls players up (unavailable for the club, no club training), the window's games are
 * played (Elo, caps) and the players go back to their clubs.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { saveService } from "@/backend/SaveService";
import { advanceOneDay } from "@/backend/advanceDay";
import { isUnavailable } from "@/Domain/discipline/discipline";
import type { Squad } from "@/types/playerTypes";

const HUMAN = "33";

describe("national teams in advanceOneDay", () => {
  let saveId = "";
  beforeAll(async () => {
    const meta = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: HUMAN, clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = meta.id;
  }, 240_000);
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("career creation: every nation, an AI coach each, the first Euro qualifiers drawn", async () => {
    const state = (await saveService.getNationalState(saveId))!;
    const teams = Object.values(state.teams);
    expect(teams.length).toBeGreaterThan(150);
    const managers = await saveService.getManagers(saveId);
    for (const t of teams) expect(managers.find((m) => m.id === t.managerId)?.squadId).toBe(t.id);
    expect(state.competitions).toContain("euroq_2028");
    const q = (await saveService.getNationalComp(saveId, "euroq_2028"))!;
    expect(q.groups.length).toBeGreaterThan(8);
    expect(q.fixtures.every((f) => f.date >= "2026-09-01")).toBe(true);
    const top = [...teams].sort((a, b) => b.elo - a.elo).slice(0, 10).map((t) => t.nation);
    expect(top.some((n) => ["France", "England", "Spain", "Brazil", "Argentina", "Germany", "Portugal"].includes(n))).toBe(true);
    // No league plays inside the September window.
    const pl = await saveService.getAllFixturesForLeague(saveId, "premier_league");
    expect(pl.some((f) => f.date >= "2026-08-31" && f.date <= "2026-09-09")).toBe(false);
  });

  test("a window: call-up, games, return", async () => {
    await saveService.updateMeta(saveId, { currentDate: "2026-08-31" });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    let state = (await saveService.getNationalState(saveId))!;
    const callUps = Object.values(state.callUps);
    expect(callUps.length).toBeGreaterThan(150);
    expect(callUps.every((c) => c.players.length === 23)).toBe(true);
    const france = state.callUps["nat_france"]!;
    const real = france.players.find((p) => !p.generated)!;
    const club = (await saveService.getSquadById(saveId, real.squadId)) as Squad;
    const player = club.players.find((p) => p.id === real.id)!;
    expect(player.nationalDuty).toMatchObject({ nation: "France", from: "2026-08-31" });
    expect(isUnavailable(player, "2026-09-01")).toBe(true);
    const sessions = player.seasonLog?.trainingSessions ?? 0;
    const eloBefore = state.teams["nat_france"]!.elo;

    await saveService.updateMeta(saveId, { currentDate: "2026-09-03" });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    state = (await saveService.getNationalState(saveId))!;
    const q = (await saveService.getNationalComp(saveId, "euroq_2028"))!;
    expect(q.fixtures.filter((f) => f.date === "2026-09-03").every((f) => f.played)).toBe(true);
    const fr = (await saveService.getNationalComp(saveId, "friendly_2026"))!;
    expect(fr.fixtures.filter((f) => f.date === "2026-09-03").every((f) => f.played)).toBe(true);
    expect(state.teams["nat_france"]!.games).toBe(1);
    expect(state.teams["nat_france"]!.elo).not.toBe(eloBefore);
    const after = ((await saveService.getSquadById(saveId, real.squadId)) as Squad).players.find((p) => p.id === real.id)!;
    expect(after.seasonLog?.trainingSessions ?? 0).toBe(sessions);

    await saveService.updateMeta(saveId, { currentDate: "2026-09-08" });
    expect((await advanceOneDay(saveService, saveId)).ok).toBe(true);
    state = (await saveService.getNationalState(saveId))!;
    expect(Object.keys(state.callUps)).toHaveLength(0);
    const back = ((await saveService.getSquadById(saveId, real.squadId)) as Squad).players.find((p) => p.id === real.id)!;
    expect(back.nationalDuty).toBeUndefined();
  }, 240_000);
});
