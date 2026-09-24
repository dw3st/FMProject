import { describe, expect, test } from "bun:test";
import type { Fixture, SeasonData } from "@/types/calendarTypes";
import type { LeagueTeam, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";
import { applyPlayerBroadcastingCredit, runSeasonTransition } from "@/Domain/season/seasonTransition";

function minimalSquad(
  id: string,
  slug: string,
  name: string,
  opts: { coach?: { id: number; name: string }; finances?: Squad["finances"] },
): Squad {
  return {
    id,
    slug,
    name,
    colors: ["#000", "#fff"],
    money: 0,
    players: [
      {
        id: `p_${id}`,
        name: "Player",
        age: 24,
        squadId: id,
        preferredFoot: "right",
        positions: ["CM"],
        stats: {
          passing: 5,
          vision: 5,
          finishing: 5,
          dribbling: 5,
          speed: 5,
          acceleration: 5,
          tackling: 5,
          pressing: 5,
          stamina: 5,
          heading: 5,
          strength: 5,
          reflex: 5,
          jump: 5,
        },
        profile: { summary: "", archetype: "test" },
        seasonLog: { ...emptySeasonLog(), goals: 3, appearances: 5 },
      },
    ],
    coach: opts.coach,
    finances: opts.finances,
  };
}

describe("runSeasonTransition", () => {
  test("archives standings, title with coach id, and player logs", () => {
    const leagueTeams: LeagueTeam[] = [
      { squadId: "a", name: "Alpha", colors: ["#000", "#fff"] },
      { squadId: "b", name: "Beta", colors: ["#111", "#eee"] },
    ];
    const fixtures: Fixture[] = [
      {
        id: "fix_1",
        date: "2025-08-20",
        competition: "test_league",
        round: 1,
        home: "a",
        away: "b",
        played: true,
        result: { home: 2, away: 0 },
      },
    ];
    const endingSeason: SeasonData = {
      year: 2025,
      start: "2025-08-15",
      end: "2026-05-20",
      calendar: fixtures,
    };
    const squads: Squad[] = [
      minimalSquad("a", "alpha", "Alpha", { coach: { id: 26675, name: "Coach A" }, finances: { broadcasting: 10_000_000, commercial: 0, total: 0, budget: 5_000_000, followers: 0 } }),
      minimalSquad("b", "beta", "Beta", { coach: { id: 1, name: "Coach B" } }),
    ];

    const result = runSeasonTransition({
      endingSeason,
      leagueSlug: "test_league",
      leagueTeams,
      squadsInLeague: squads,
      playerClubSquadId: "a",
    });

    expect(result.archive.year).toBe(2025);
    expect(result.archive.standings[0]!.squadId).toBe("a");
    expect(result.archive.titles[0]!.coachId).toBe(26675);
    expect(result.archive.titles[0]!.coachName).toBe("Coach A");
    expect(result.archive.playerLogs["p_a"]!.goals).toBe(3);

    expect(result.newSeason.year).toBe(2026);
    expect(result.newSeason.calendar.length).toBeGreaterThan(0);
    expect(result.playerBroadcastingCredit).toBe(10_000_000);

    const alphaOut = result.squadsToSave.find((r) => r.clubSlug === "alpha")!;
    expect(alphaOut.squad.players[0]!.age).toBe(25);
    expect(alphaOut.squad.players[0]!.seasonLog!.goals).toBe(0);
    expect(alphaOut.squad.finances?.budget).toBe(5_000_000);

    const betaOut = result.squadsToSave.find((r) => r.clubSlug === "beta")!;
    expect(betaOut.squad.finances?.budget ?? 0).toBe(0);
  });

  test("AI club receives broadcasting into transfer budget", () => {
    const leagueTeams: LeagueTeam[] = [
      { squadId: "a", name: "A", colors: ["#000", "#fff"] },
      { squadId: "b", name: "B", colors: ["#111", "#eee"] },
    ];
    const fixtures: Fixture[] = [
      {
        id: "fix_1",
        date: "2025-08-20",
        competition: "x",
        round: 1,
        home: "b",
        away: "a",
        played: true,
        result: { home: 0, away: 1 },
      },
    ];
    const endingSeason: SeasonData = {
      year: 2025,
      start: "2025-08-15",
      end: "2026-05-20",
      calendar: fixtures,
    };
    const squads: Squad[] = [
      minimalSquad("a", "a", "A", {
        finances: { broadcasting: 0, commercial: 0, total: 0, budget: 0, followers: 0 },
      }),
      minimalSquad("b", "b", "B", {
        finances: { broadcasting: 2_000_000, commercial: 0, total: 0, budget: 1_000_000, followers: 0 },
      }),
    ];

    const result = runSeasonTransition({
      endingSeason,
      leagueSlug: "x",
      leagueTeams,
      squadsInLeague: squads,
      playerClubSquadId: "a",
    });

    const bOut = result.squadsToSave.find((r) => r.squad.id === "b")!;
    expect(bOut.squad.finances!.budget).toBe(3_000_000);
    expect(result.playerBroadcastingCredit).toBe(0);
  });
});

describe("applyPlayerBroadcastingCredit", () => {
  const leagueTeams: LeagueTeam[] = [
    { squadId: "a", name: "Alpha", colors: ["#000", "#fff"] },
    { squadId: "b", name: "Beta", colors: ["#111", "#eee"] },
  ];
  const endingSeason: SeasonData = { year: 2025, start: "2025-08-15", end: "2026-05-20", calendar: [] };
  const transition = () =>
    runSeasonTransition({
      endingSeason,
      leagueSlug: "test_league",
      leagueTeams,
      squadsInLeague: [
        minimalSquad("a", "alpha", "Alpha", {
          finances: { broadcasting: 10_000_000, commercial: 0, total: 0, budget: 5_000_000, followers: 0 },
        }),
        minimalSquad("b", "beta", "Beta", {
          finances: { broadcasting: 2_000_000, commercial: 0, total: 0, budget: 1_000_000, followers: 0 },
        }),
      ],
      playerClubSquadId: "a",
    });

  test("credits the reset player squad: aged, seasonLog cleared, budget += credit", () => {
    const t = transition();
    const out = applyPlayerBroadcastingCredit(t.squadsToSave, "a", t.playerBroadcastingCredit);
    const alpha = out.find((r) => r.squad.id === "a")!;
    expect(alpha.squad.players[0]!.age).toBe(25);
    expect(alpha.squad.players[0]!.seasonLog!.goals).toBe(0);
    expect(alpha.squad.players[0]!.seasonLog!.appearances).toBe(0);
    expect(alpha.squad.finances!.budget).toBe(15_000_000);
    // AI club untouched by the player credit
    expect(out.find((r) => r.squad.id === "b")!.squad.finances!.budget).toBe(3_000_000);
  });

  test("does not mutate the input refs", () => {
    const t = transition();
    applyPlayerBroadcastingCredit(t.squadsToSave, "a", t.playerBroadcastingCredit);
    expect(t.squadsToSave.find((r) => r.squad.id === "a")!.squad.finances!.budget).toBe(5_000_000);
  });

  test("zero credit or absent player squad returns refs unchanged", () => {
    const t = transition();
    expect(applyPlayerBroadcastingCredit(t.squadsToSave, "a", 0)).toEqual(t.squadsToSave);
    expect(applyPlayerBroadcastingCredit(t.squadsToSave, "zzz", 1_000)).toEqual(t.squadsToSave);
  });

  test("player squad without finances gets a default finances block holding the credit", () => {
    const refs = [{ leagueSlug: "x", clubSlug: "a", squad: minimalSquad("a", "a", "A", {}) }];
    const out = applyPlayerBroadcastingCredit(refs, "a", 7);
    expect(out[0]!.squad.finances!.budget).toBe(7);
  });
});
