import { describe, expect, test } from "bun:test";
import {
  clubAnnualRevenue,
  clubWageFactor,
  playerWeeklyWage,
  squadCurveBill,
  squadWeeklyWages,
  wageFactorOf,
  weeklyWage,
} from "@/Domain/finance/wages";
import { WAGE_CONFIG } from "@/Domain/finance/wageConfig";
import { gateRevenue } from "@/Domain/finance/gate";
import { Player } from "@/Domain/Player";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function makePlayer(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: "p1",
    name: "Test Player",
    age: 24,
    squadId: "sq1",
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
    ...overrides,
  };
}

function makeSquad(overrides: Partial<Squad> = {}): Squad {
  return {
    id: "c1",
    name: "Test FC",
    colors: ["#000000", "#ffffff"],
    money: 0,
    players: [makePlayer({ id: "a" }), makePlayer({ id: "b" })],
    finances: { broadcasting: 10_000_000, commercial: 5_000_000, total: 15_000_000, budget: 1_000_000, followers: 0 },
    venue: { name: "Arena", city: "City", capacity: 40_000, surface: "grass" },
    ...overrides,
  };
}

describe("weeklyWage", () => {
  test("monotonic in rating", () => {
    for (let r = 0; r < 10; r += 0.5) expect(weeklyWage(r + 0.5)).toBeGreaterThanOrEqual(weeklyWage(r));
  });

  test("floor for youngsters / very low ratings", () => {
    expect(weeklyWage(0)).toBe(WAGE_CONFIG.FLOOR);
  });

  test("whole euros", () => expect(Number.isInteger(weeklyWage(6.3))).toBe(true));

  test("never below the floor at any rating", () => {
    for (let r = 0; r <= 10; r += 0.25) expect(weeklyWage(r)).toBeGreaterThanOrEqual(WAGE_CONFIG.FLOOR);
  });

  test("the 6 → 7 rating step is a plausible ~2–2.5x pay rise", () => {
    const step = weeklyWage(7) / weeklyWage(6);
    expect(step).toBeGreaterThanOrEqual(2);
    expect(step).toBeLessThanOrEqual(2.5);
  });

  test("sanity cap: rating 10 (the theoretical max) never costs more than €5M/week", () => {
    expect(weeklyWage(10)).toBeLessThanOrEqual(5_000_000);
  });
});

describe("clubWageFactor", () => {
  test("revenue exactly at the target share gives factor 1", () => {
    const curveBill = 10_000; // €/week
    const revenue = (52 * curveBill) / WAGE_CONFIG.TARGET_SHARE;
    expect(clubWageFactor(revenue, curveBill)).toBeCloseTo(1, 6);
  });

  test("clamps to MIN_FACTOR for a poor club relative to its curve bill", () => {
    expect(clubWageFactor(1, 1_000_000)).toBe(WAGE_CONFIG.MIN_FACTOR);
  });

  test("clamps to MAX_FACTOR for a rich club relative to its curve bill", () => {
    expect(clubWageFactor(1_000_000_000, 1)).toBe(WAGE_CONFIG.MAX_FACTOR);
  });

  test("degenerate empty-squad curve bill (0) does not divide by zero", () => {
    expect(Number.isFinite(clubWageFactor(10_000_000, 0))).toBe(true);
  });
});

describe("squadCurveBill", () => {
  test("sums every player's raw curve wage (no factor)", () => {
    const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" })];
    const expected = weeklyWage(Player.overallAvg(players[0]!)) + weeklyWage(Player.overallAvg(players[1]!));
    expect(squadCurveBill(players)).toBe(expected);
  });

  test("empty squad has zero curve bill", () => {
    expect(squadCurveBill([])).toBe(0);
  });
});

describe("playerWeeklyWage", () => {
  test("is the curve wage times the club factor, rounded", () => {
    const p = makePlayer();
    expect(playerWeeklyWage(p, 2)).toBe(Math.round(weeklyWage(Player.overallAvg(p)) * 2));
  });

  test("factor 1 reproduces the raw curve wage", () => {
    const p = makePlayer();
    expect(playerWeeklyWage(p, 1)).toBe(weeklyWage(Player.overallAvg(p)));
  });
});

describe("squadWeeklyWages", () => {
  test("sums every player's factored weekly wage", () => {
    const players = [makePlayer({ id: "a" }), makePlayer({ id: "b" })];
    const expected = playerWeeklyWage(players[0]!, 1.5) + playerWeeklyWage(players[1]!, 1.5);
    expect(squadWeeklyWages(players, 1.5)).toBe(expected);
  });

  test("empty squad has zero wage bill", () => {
    expect(squadWeeklyWages([], 1)).toBe(0);
  });
});

describe("clubAnnualRevenue", () => {
  test("broadcasting + commercial + estimated league gate", () => {
    const squad = makeSquad();
    const homeGames = 19;
    const expected = 10_000_000 + 5_000_000 + gateRevenue(40_000, "league") * homeGames;
    expect(clubAnnualRevenue(squad, homeGames)).toBe(expected);
  });

  test("no venue on record contributes no gate", () => {
    const squad = makeSquad({ venue: undefined });
    expect(clubAnnualRevenue(squad, 19)).toBe(15_000_000);
  });
});

describe("wageFactorOf", () => {
  test("uses the stored wageFactor when present", () => {
    const squad = makeSquad({ wageFactor: 1.75 });
    expect(wageFactorOf(squad)).toBe(1.75);
  });

  test("computes on the fly from the squad when absent", () => {
    const squad = makeSquad();
    const revenue = clubAnnualRevenue(squad, 19);
    const expected = clubWageFactor(revenue, squadCurveBill(squad.players));
    expect(wageFactorOf(squad)).toBe(expected);
  });
});
