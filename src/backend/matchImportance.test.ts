import { describe, expect, test } from "bun:test";
import { homeMatchImportance } from "@/backend/matchImportance";
import { MATCH_IMPORTANCE } from "@/Domain/facilities/matchImportance";
import type { SaveService } from "@/backend/SaveService";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad, StandingRow } from "@/types/playerTypes";

function squad(id: string, city: string): Squad {
  return {
    id, name: id, colors: ["#000000", "#ffffff"], money: 0, players: [],
    venue: { name: `${id} Arena`, city, capacity: 30000 },
  } as Squad;
}

const row = (squadId: string, mp: number, pts: number) => ({ squadId, name: squadId, mp, pts }) as unknown as StandingRow;

function fakeService(squads: Squad[], standings: StandingRow[] | null): SaveService {
  return {
    getSquadById: async (_save: string, id: string) => squads.find((s) => s.id === id) ?? null,
    getLeagueStandings: async () => standings,
  } as unknown as SaveService;
}

const fixture = (over: Partial<Fixture> = {}): Fixture => ({
  id: "fix_1", date: "2027-03-01", competition: "liga", round: 3, home: "me", away: "opp",
  played: false, result: null, ...over,
});

describe("home match importance (server)", () => {
  test("league game against an ordinary club of another city = 1", async () => {
    const svc = fakeService([squad("me", "Town"), squad("opp", "Elsewhere")], [row("x", 3, 9), row("me", 3, 6), row("opp", 3, 3)]);
    expect(await homeMatchImportance(svc, "s", fixture(), "me", { leagueSlug: "liga" })).toEqual({ derby: false, mult: 1 });
  });

  test("same city is a derby (accents and case ignored)", async () => {
    const svc = fakeService([squad("me", "São Paulo"), squad("opp", "sao paulo")], null);
    expect(await homeMatchImportance(svc, "s", fixture(), "me", { leagueSlug: "liga" })).toEqual({ derby: true, mult: MATCH_IMPORTANCE.DERBY });
  });

  test("the league leader with games played counts as a big game (league only)", async () => {
    const table = [row("opp", 3, 9), row("me", 3, 6)];
    const svc = fakeService([squad("me", "Town"), squad("opp", "Elsewhere")], table);
    expect((await homeMatchImportance(svc, "s", fixture(), "me", { leagueSlug: "liga" })).derby).toBe(true);
    // no games yet: not a big game
    expect((await homeMatchImportance(svc, "s", fixture(), "me", { leagueSlug: "liga", standings: [row("opp", 0, 0)] })).derby).toBe(false);
    // the leader in a cup tie is not a derby
    const cup = fixture({ competition: "cup_england" });
    expect((await homeMatchImportance(svc, "s", cup, "me", { leagueSlug: "liga" })).derby).toBe(false);
  });

  test("cup and continental knockouts; continental group stage = 1", async () => {
    const svc = fakeService([squad("me", "Town"), squad("opp", "Elsewhere")], null);
    const ctx = { leagueSlug: "liga" };
    expect((await homeMatchImportance(svc, "s", fixture({ competition: "cup_england", knockout: true }), "me", ctx)).mult).toBe(MATCH_IMPORTANCE.CUP_KNOCKOUT);
    expect((await homeMatchImportance(svc, "s", fixture({ competition: "ucl", knockout: true }), "me", ctx)).mult).toBe(MATCH_IMPORTANCE.CONTINENTAL_KNOCKOUT);
    expect((await homeMatchImportance(svc, "s", fixture({ competition: "ucl" }), "me", ctx)).mult).toBe(1);
  });

  test("uses the squadOf cache when given", async () => {
    const svc = fakeService([], null);
    const cache = new Map([["me", squad("me", "Rio")], ["opp", squad("opp", "RIO")]]);
    const r = await homeMatchImportance(svc, "s", fixture(), "me", { leagueSlug: "liga", standings: null, squadOf: async (id) => cache.get(id) ?? null });
    expect(r.derby).toBe(true);
  });
});
