import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "crypto";
import { saveService } from "@/backend/SaveService";
import { FileSystemDAL } from "@/backend/dal/FileSystemDAL";
import { runWorldCeremony } from "@/backend/awardsWorld";
import type { LeagueSeasonAwards } from "@/types/awardTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { PlayerHistoryRow, RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * World awards in January (`.claude/rules/game/awards.md` §5), on a small save: one club, an
 * `awards/2027.json` with two leagues, a manager with a title credited in 2027.
 */
const dal = new FileSystemDAL();
const created: string[] = [];
afterAll(async () => { for (const id of created) await saveService.deleteSave(id); });

const row = (season: string, league: string): PlayerHistoryRow => ({
  season, squadId: "33", clubName: "Club", league, apps: 30, goals: 10, assists: 5, avgRating: 7.5,
  cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [],
});
const player = (id: string): RosterPlayer => ({
  id, name: id, age: 27, squadId: "33", preferredFoot: "right", positions: ["ST"],
  stats: { passing: 6, vision: 6, finishing: 7, dribbling: 6, speed: 6, acceleration: 6, tackling: 3, pressing: 5, stamina: 6, strength: 6, heading: 5, jump: 5, reflex: 1 },
  profile: { summary: "", archetype: "t" }, history: [row("2026-27", "premier_league")],
} as unknown as RosterPlayer);
const league = (slug: string, season: string, weight: number, players: { id: string; squadId: string; score: number }[], managers: { id: string; squadId: string; score: number }[]): LeagueSeasonAwards => ({
  league: slug, season, closedOn: "2027-05-20", country: "England", tier: 1, weight, teamOfSeason: [],
  shortlist: {
    players: players.map((p) => ({ playerId: p.id, name: p.id, squadId: p.squadId, clubName: "Club", value: 7.5, leagueApps: 30, seasonScore: p.score })),
    managers: managers.map((m) => ({ managerId: m.id, name: m.id, squadId: m.squadId, clubName: "Club", position: 1, target: 4, score: m.score })),
  },
});
const manager = (id: string, squadId: string, on?: string): ManagerRecord => ({
  id, name: id, squadId, isPlayer: false, points: on ? 100 : 0, seasons: 1,
  titles: on ? [{ season: "2026-27", kind: "league", competition: "premier_league", squadId, points: 100, on }] : [],
});

describe("world ceremony", () => {
  test("January: world entry once, winner's row + boost, manager award, message; no-op otherwise", async () => {
    const saveId = `test-world-${randomUUID()}`;
    created.push(saveId);
    await dal.writeSquad(saveId, "premier_league", "33", { id: "33", name: "Club", colors: ["#fff", "#000"], players: [player("p1")] } as unknown as Squad);
    await saveService.writeAwardsYear(saveId, {
      year: 2027,
      leagues: [
        league("premier_league", "2026-27", 1, [{ id: "p1", squadId: "33", score: 8 }], [{ id: "m2", squadId: "40", score: 0.2 }]),
        league("of_x", "2027", 0.5, [{ id: "p9", squadId: "99", score: 9 }], []),
      ],
    });
    await saveService.writeManagers(saveId, [manager("m1", "33", "2027-06-01"), manager("m2", "40")]);
    const args = {
      managers: () => saveService.getManagers(saveId),
      applyManagers: async (fn: (m: ManagerRecord[]) => ManagerRecord[]) => saveService.writeManagers(saveId, fn(await saveService.getManagers(saveId))),
      playerClubId: null,
    };

    expect(await runWorldCeremony(saveService, saveId, "2027-12-31", args)).toBeNull();
    const msg = await runWorldCeremony(saveService, saveId, "2028-01-01", args);
    expect(msg?.kind).toBe("world");

    const file = (await saveService.getAwardsYear(saveId, 2027))!;
    expect(file.world).toMatchObject({ year: 2027, on: "2028-01-01" });
    expect(file.world!.player[0]!.id).toBe("p1"); // 1 × (8 − 5) beats 0,5 × (9 − 5)
    expect(file.world!.manager[0]!.id).toBe("m1"); // 100 title points in 2027 ÷ 200 beat 0,2

    const p1 = (await saveService.getSquadById(saveId, "33"))!.players[0]!;
    expect(p1.history![0]!.awards).toEqual([{ kind: "world_player", year: 2027 }]);
    expect(p1.awardBoost?.mult).toBe(1.15);
    const m1 = (await saveService.getManagers(saveId)).find((m) => m.id === "m1")!;
    expect(m1.awards).toEqual([{ season: "2027", kind: "world_manager", competition: "world", squadId: "33", year: 2027 }]);

    // Once: the next January day changes nothing.
    expect(await runWorldCeremony(saveService, saveId, "2028-01-02", args)).toBeNull();
    expect((await saveService.getAwardsYear(saveId, 2027))!.world).toEqual(file.world);
    // No file for the previous year: nothing.
    expect(await runWorldCeremony(saveService, saveId, "2029-01-01", args)).toBeNull();
  });
});
