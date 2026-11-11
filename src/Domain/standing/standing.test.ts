import { describe, expect, test } from "bun:test";
import { clubBar, clubTotals, fansBar, standingValueMult, withStandings, worldBar, worldRanks } from "@/Domain/standing/standing";
import type { PlayerHistoryRow, RosterPlayer, Squad } from "@/types/playerTypes";

const row = (season: string, squadId: string, apps: number, goals: number, rating: number, extra: Partial<PlayerHistoryRow> = {}): PlayerHistoryRow => ({
  season, squadId, clubName: "", league: "", apps, goals, assists: 0, avgRating: rating,
  cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [], ...extra,
});

describe("player standing (9.2)", () => {
  test("fans: rating, contribution and tenure at this club only", () => {
    const p = { history: [row("2025", "a", 30, 15, 7.2), row("2026", "a", 30, 15, 7.2), row("2024", "b", 30, 30, 8)] } as unknown as RosterPlayer;
    const t = clubTotals(p, "a");
    expect(t.apps).toBe(60);
    expect(t.seasons).toBe(2);
    // rating 5 + contribution 2 + tenure 1.2 → 8
    expect(fansBar(t)).toBe(8);
    expect(fansBar(clubTotals({ history: [] } as unknown as RosterPlayer, "a"))).toBe(3);
  });

  test("club: role, idol and legend", () => {
    const none = { apps: 10, goals: 0, assists: 0, titles: 0, awards: 0, seasons: 1, avgRating: null };
    expect(clubBar("key", none)).toBe(7);
    expect(clubBar("backup", none)).toBe(2);
    expect(clubBar("backup", { ...none, apps: 160 })).toBe(8);
    expect(clubBar("backup", { ...none, apps: 320 })).toBe(10);
  });

  test("world: rank and awards", () => {
    expect(worldBar(5, [])).toBe(10);
    expect(worldBar(400, [])).toBe(5);
    expect(worldBar(undefined, [])).toBe(0);
    expect(worldBar(20000, [row("2026", "a", 30, 0, 7, { awards: [{ kind: "best_player" }, { kind: "team_of_season" }] as never })])).toBe(2);
    expect(worldBar(20000, [row("2020", "a", 30, 0, 7, { awards: [{ kind: "world_player" }] as never })])).toBe(9);
  });

  test("value: neutral without bars, capped at ±15%", () => {
    expect(standingValueMult({})).toBe(1);
    expect(standingValueMult({ standing: { fans: 3, club: 4, world: 0 } })).toBe(1);
    expect(standingValueMult({ standing: { fans: 10, club: 10, world: 10 } })).toBeCloseTo(1.15);
    expect(standingValueMult({ standing: { fans: 0, club: 0, world: 0 } })).toBeCloseTo(0.93);
  });

  test("withStandings keeps the same squad when nothing changed", () => {
    const mk = (id: string, finishing: number) => ({
      id, name: id, age: 25, positions: ["Forward"], nationality: "Brazil",
      stats: { finishing, dribbling: 5, passing: 5, vision: 5, tackling: 5, pressing: 5, speed: 5, acceleration: 5, strength: 5, stamina: 5, heading: 5, reflex: 1, jump: 1 },
    }) as unknown as RosterPlayer;
    const squad = { id: "s", players: [mk("x", 8), mk("y", 4)] } as unknown as Squad;
    const ranks = worldRanks([squad]);
    expect(ranks.get("x")).toBe(1);
    const once = withStandings(squad, ranks);
    expect(once).not.toBe(squad);
    expect(once.players[0]!.standing?.world).toBe(10);
    expect(withStandings(once, ranks)).toBe(once);
  });
});
