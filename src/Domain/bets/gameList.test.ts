import { describe, expect, test } from "bun:test";
import { betCompetitions, filterBetGames, groupBetGames } from "@/Domain/bets/gameList";
import type { BetGame } from "@/types/betTypes";

function game(competition: string, fixtureId: string, date: string, homeName: string, awayName: string, kickoff = "16:00"): BetGame {
  return {
    competition, fixtureId, date, home: `${fixtureId}h`, away: `${fixtureId}a`, homeName, awayName, own: null, kickoff,
    markets: { result: [], scores: [], scorers: [] },
  };
}

const today = "2026-08-15";
const games = [
  game("premier_league", "1", "2026-08-16", "Arsenal", "Chelsea", "17:30"),
  game("premier_league", "2", "2026-08-16", "Everton", "Fulham", "12:30"),
  game("premier_league", "3", "2026-08-20", "Liverpool", "Spurs"),
  game("brazil_serie_a", "4", "2026-08-17", "São Paulo", "Grêmio"),
  game("la_liga", "5", "2026-08-16", "Atlético Madrid", "Sevilla"),
  game("cup_england", "6", "2026-08-18", "Leeds", "Burnley"),
];

describe("filterBetGames", () => {
  const base = { query: "", scope: "all", days: "week" as const, today, mine: ["premier_league", "cup_england"] };

  test("scope: his competitions, every one, or one", () => {
    expect(filterBetGames(games, { ...base, scope: "mine" }).map((g) => g.fixtureId)).toEqual(["1", "2", "3", "6"]);
    expect(filterBetGames(games, base)).toHaveLength(6);
    expect(filterBetGames(games, { ...base, scope: "la_liga" }).map((g) => g.fixtureId)).toEqual(["5"]);
  });

  test("days: tomorrow and the next three", () => {
    expect(filterBetGames(games, { ...base, days: "tomorrow" }).map((g) => g.fixtureId)).toEqual(["1", "2", "5"]);
    expect(filterBetGames(games, { ...base, days: "three" }).map((g) => g.fixtureId)).toEqual(["1", "2", "4", "5", "6"]);
  });

  test("the club search ignores accents and case and looks at every competition", () => {
    expect(filterBetGames(games, { ...base, scope: "mine", query: "sao paulo" }).map((g) => g.fixtureId)).toEqual(["4"]);
    expect(filterBetGames(games, { ...base, scope: "la_liga", query: "GREMIO" }).map((g) => g.fixtureId)).toEqual(["4"]);
    expect(filterBetGames(games, { ...base, query: "atletico" }).map((g) => g.fixtureId)).toEqual(["5"]);
    expect(filterBetGames(games, { ...base, query: "  " })).toHaveLength(6);
  });
});

describe("groupBetGames", () => {
  test("his competitions first, then by number of games; days and kickoffs in order", () => {
    const groups = groupBetGames(games, ["cup_england", "premier_league"]);
    expect(groups.map((g) => g.competition)).toEqual(["cup_england", "premier_league", "brazil_serie_a", "la_liga"]);
    const pl = groups[1]!;
    expect(pl.count).toBe(3);
    expect(pl.days.map((d) => d.date)).toEqual(["2026-08-16", "2026-08-20"]);
    expect(pl.days[0]!.games.map((g) => g.fixtureId)).toEqual(["2", "1"]);
  });
});

describe("betCompetitions", () => {
  test("counts the games of each competition, most first", () => {
    expect(betCompetitions(games)[0]).toEqual({ competition: "premier_league", count: 3 });
    expect(betCompetitions(games)).toHaveLength(4);
  });
});
