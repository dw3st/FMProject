import { afterAll, describe, expect, test } from "bun:test";
import { matchCrowd, matchManagers } from "@/backend/matchCrowd";
import { saveService, type SaveMeta, type SaveService } from "@/backend/SaveService";
import { apiRoutes } from "@/backend/routes";
import { devAutoLogin } from "@/backend/auth/AuthService";
import { recordSaveOwnership } from "@/backend/auth/saveOwnership";
import { autoLineupDefaultFormation } from "@/Domain/advanceDay/matchSimulationLineups";
import { attendanceOf, initialFacilities, seasonFraction } from "@/Domain/facilities/facilities";
import { MATCH_IMPORTANCE } from "@/Domain/facilities/matchImportance";
import { leagueTierOf } from "@/backend/facilityWorld";
import { GATE } from "@/Domain/finance/gate";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { TacticsSave } from "@/types/tacticsTypes";

function squad(id: string, city: string, capacity: number): Squad {
  return {
    id, name: id, colors: ["#000000", "#ffffff"], money: 0, players: [],
    venue: { name: `${id} Arena`, city, capacity },
    finances: { broadcasting: 60_000_000, commercial: 30_000_000, total: 90_000_000, budget: 0, followers: 2_000_000 },
  } as Squad;
}

const fakeService = (squads: Squad[]) => ({
  getSquadIndex: async () => ({ byId: () => ({ leagueSlug: "premier_league" }) }),
  getSquadById: async (_s: string, id: string) => squads.find((s) => s.id === id) ?? null,
  getLeagueStandings: async () => null,
}) as unknown as SaveService;

const meta = {
  id: "s1", leagueSlug: "premier_league", clubId: "me", board: { fans: 60 },
  activeLeagues: [{ leagueSlug: "premier_league", start: "2026-08-15", end: "2027-05-20" }],
} as unknown as SaveMeta;

const fixture = (over: Partial<Fixture> = {}): Fixture => ({
  id: "fix_9", date: "2026-11-01", competition: "premier_league", round: 9, home: "me", away: "opp",
  played: false, result: null, ...over,
});

describe("match crowd", () => {
  test("home game with facilities: the same attendance the gate of the day charges", async () => {
    const me = { ...squad("me", "Town", 40000) };
    me.facilities = initialFacilities(me, 1);
    const opp = squad("opp", "Elsewhere", 30000);
    const c = await matchCrowd(fakeService([me, opp]), meta, fixture(), me, opp);
    const a = attendanceOf(me.facilities, {
      followers: 2_000_000, tier: await leagueTierOf("premier_league"), fans: 60,
      fraction: seasonFraction("2026-11-01", "2026-08-15", "2027-05-20"), date: "2026-11-01",
    });
    expect(c).toEqual({ attendance: Math.round(a.attendance), capacity: a.capacity, neutral: false, importance: 1, known: true });
    expect(c.attendance).toBeLessThanOrEqual(c.capacity);
  });

  test("derby at home raises the demand ×1,2 (attendance never above capacity)", async () => {
    const me = { ...squad("me", "Town", 80000) };
    me.facilities = initialFacilities(me, 1);
    const plain = await matchCrowd(fakeService([me]), meta, fixture(), me, squad("opp", "Elsewhere", 30000));
    const derby = await matchCrowd(fakeService([me]), meta, fixture(), me, squad("opp", "town", 30000));
    expect(derby.importance).toBe(MATCH_IMPORTANCE.DERBY);
    expect(derby.attendance).toBeGreaterThan(plain.attendance);
    expect(derby.attendance).toBeLessThanOrEqual(derby.capacity);
  });

  test("a stand under works on the match day goes with the crowd (#137)", async () => {
    const me = { ...squad("me", "Town", 40000) };
    me.facilities = initialFacilities(me, 1);
    const project = {
      id: "w1", kind: "stand" as const, stand: "north" as const, seats: 2000, start: "2026-10-01", end: "2026-12-01",
      cost: 1, boardShare: 0, instalments: 1, paid: 1,
    };
    me.facilities = { ...me.facilities, projects: [project as never] };
    const opp = squad("opp", "Elsewhere", 30000);
    expect((await matchCrowd(fakeService([me, opp]), meta, fixture(), me, opp)).works).toEqual(["north"]);
    // On the day the works end the stand is open again; away games never carry it.
    expect((await matchCrowd(fakeService([me, opp]), meta, fixture({ date: "2026-12-01" }), me, opp)).works).toBeUndefined();
    expect((await matchCrowd(fakeService([me, opp]), meta, fixture({ home: "opp", away: "me" }), me, opp)).works).toBeUndefined();
  });

  test("away: the AI rule; neutral: unknown", async () => {
    const me = squad("me", "Town", 40000);
    const opp = squad("opp", "Elsewhere", 30000);
    expect(await matchCrowd(fakeService([me, opp]), meta, fixture({ home: "opp", away: "me" }), me, opp))
      .toEqual({ attendance: Math.round(30000 * GATE.FILL_RATE), capacity: 30000, neutral: false, importance: 1, known: true });
    const n = await matchCrowd(fakeService([me, opp]), meta, fixture({ neutral: true }), me, opp);
    expect(n.known).toBe(false);
    expect(n.neutral).toBe(true);
  });

  test("managers: the human and the opponent's record; none = null", () => {
    const records = [
      { id: "player", squadId: "me", isPlayer: true },
      { id: "coach_7", squadId: "opp", isPlayer: false, clubs: [{ squadId: "old", from: "2026-08-01" }] },
    ] as unknown as ManagerRecord[];
    const m = matchManagers({ ...meta, manager: { name: "X", nationalityIso: "br" } } as unknown as SaveMeta, records, "opp", (id) => (id === "old" ? "Brazil" : null));
    expect(m.mine.id).toBe("player");
    expect(m.mine.nationality).toBe("Brazil");
    expect(m.opponent).toEqual({ id: "coach_7", nationality: "Brazil" });
    expect(matchManagers(meta, [], "opp", () => null).opponent).toBeNull();
  });
});

describe("/api/match-setup crowd and managers", () => {
  let saveId = "";
  afterAll(async () => { if (saveId) await saveService.deleteSave(saveId); });

  test("today's game carries the crowd and both managers", async () => {
    const created = await saveService.createSave({
      leagueSlug: "premier_league", leagueName: "Premier League",
      clubId: "33", clubName: "Test", clubColors: ["#000000", "#ffffff"],
    });
    saveId = created.id;
    const fx = (await saveService.getAllFixturesForLeague(saveId, "premier_league"))
      .filter((f) => f.home === "33" && !f.played)
      .sort((a, b) => a.date.localeCompare(b.date))[0]!;
    const mySquad = (await saveService.getSquadById(saveId, "33"))!;
    const tactics: TacticsSave = { tactical_style: "balanced", formation: "4-3-3", lineup: autoLineupDefaultFormation(mySquad) };
    await saveService.saveTactics(saveId, tactics);
    await saveService.updateMeta(saveId, { currentDate: fx.date });

    const { user, session } = devAutoLogin(`match-setup-crowd-${saveId}@test.local`);
    recordSaveOwnership(saveId, user.id);
    const res = await apiRoutes["/api/match-setup"](new Request(`http://localhost/api/match-setup?saveId=${saveId}`, {
      headers: { cookie: `fs_session=${session.token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json() as { crowd: { known: boolean; attendance: number; capacity: number; importance: number }; managers: { mine: { id: string }; opponent: { id: string } | null } };
    expect(body.crowd.known).toBe(true);
    expect(body.crowd.attendance).toBeGreaterThan(0);
    expect(body.crowd.attendance).toBeLessThanOrEqual(body.crowd.capacity);
    expect(body.crowd.importance).toBeGreaterThanOrEqual(1);
    expect(body.managers.mine.id).toBe("player");
    const oppRecord = (await saveService.getManagers(saveId)).find((m) => m.squadId === fx.away && !m.isPlayer);
    expect(body.managers.opponent?.id).toBe(oppRecord!.id);
  }, 300_000);
});
