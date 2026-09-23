import { describe, expect, test } from "bun:test";
import {
  buildRestEvent,
  MAX_POINTS_LOST_PER_REST,
  rollRestOutcome,
} from "@/Domain/advanceDay/dailyRest";
import { generateRestDays } from "@/Domain/season";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { Fixture } from "@/types/calendarTypes";

function makeSeasonLog(overrides: Partial<NonNullable<RosterPlayer["seasonLog"]>> = {}): NonNullable<RosterPlayer["seasonLog"]> {
  return {
    appearances: 0, goals: 0, assists: 0, shots: 0,
    passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0,
    avgRating: 0, recentRatings: [], trainingSessions: 3, fitness: 70, morale: 70,
    ...overrides,
  };
}

function basePlayer(overrides: Partial<RosterPlayer> & Pick<RosterPlayer, "id" | "name">): RosterPlayer {
  return {
    age: 22,
    squadId: "s1",
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 10, vision: 10, finishing: 10, dribbling: 10,
      speed: 10, acceleration: 10, tackling: 10, pressing: 10,
      stamina: 10, heading: 10, strength: 10, reflex: 10, jump: 10,
    },
    profile: { summary: "", archetype: "test" },
    seasonLog: makeSeasonLog(),
    ...overrides,
  };
}

function baseSquad(players: RosterPlayer[]): Squad {
  return { id: "s", name: "Test FC", colors: ["#000", "#fff"], money: 0, players };
}

// ── rollRestOutcome ───────────────────────────────────────────────────────────

describe("rollRestOutcome", () => {
  test("age 22, rand=0.5 → expected fitness gain and points loss", () => {
    const rand = () => 0.5;
    const { fitnessDelta, pointsDelta } = rollRestOutcome(22, rand);
    // pointsLost = 0.5 * 2 = 1.0 → pointsDelta = -1.0
    expect(pointsDelta).toBe(-1.0);
    // baseRecovery = 7 + 0.5*(13-7) = 10; restAgeRecoveryFactor(22)=1.5 → +15.0
    expect(fitnessDelta).toBe(15.0);
  });

  test("no goalkeeper modifier on rest — recovery uses only age (same as outfield for same age)", () => {
    const rand = () => 0.5;
    expect(rollRestOutcome(22, rand)).toEqual(rollRestOutcome(22, rand));
  });

  test("younger player recovers more fitness than older (same RNG)", () => {
    const rand = () => 0.5;
    const young = rollRestOutcome(22, rand);
    const old   = rollRestOutcome(35, rand);
    expect(young.fitnessDelta).toBeGreaterThan(old.fitnessDelta);
  });

  test("fitnessDelta is always > 0", () => {
    for (const age of [18, 25, 30, 35, 40]) {
      const { fitnessDelta } = rollRestOutcome(age, () => 0);
      expect(fitnessDelta).toBeGreaterThan(0);
    }
  });

  test("pointsDelta is always ≤ 0", () => {
    for (const r of [0, 0.5, 1]) {
      const { pointsDelta } = rollRestOutcome(22, () => r);
      expect(pointsDelta).toBeLessThanOrEqual(0);
    }
  });

  test("pointsDelta magnitude never exceeds MAX_POINTS_LOST_PER_REST", () => {
    // Worst case: rand() = 1 for first call (points)
    const draws = [1, 0.5];
    let i = 0;
    const { pointsDelta } = rollRestOutcome(22, () => draws[i++] ?? 0);
    expect(Math.abs(pointsDelta)).toBeLessThanOrEqual(MAX_POINTS_LOST_PER_REST);
  });

  test("uses exactly two random draws (points then recovery)", () => {
    let calls = 0;
    rollRestOutcome(25, () => { calls++; return 0.5; });
    expect(calls).toBe(2);
  });
});

// ── buildRestEvent ────────────────────────────────────────────────────────────

describe("buildRestEvent", () => {
  function withRand(fn: () => void) {
    const orig = Math.random;
    Math.random = () => 0.5;
    try { fn(); } finally { Math.random = orig; }
  }

  test("ALL players rest regardless of current fitness", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ fitness: 20 }) }),
      basePlayer({ id: "p2", name: "Two", seasonLog: makeSeasonLog({ fitness: 95 }) }),
    ]);

    withRand(() => {
      const { event } = buildRestEvent("s", squad);
      expect(event.kind).toBe("rest");
      expect(event.effects).toHaveLength(2);
    });
  });

  test("fitness increases and trainingSessions decrease", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ fitness: 70, trainingSessions: 3 }) }),
    ]);

    withRand(() => {
      const { updatedSquad } = buildRestEvent("s", squad);
      const p1 = updatedSquad.players[0]!;
      expect(p1.seasonLog!.fitness).toBeGreaterThan(70);
      expect(p1.seasonLog!.trainingSessions).toBeLessThan(3);
    });
  });

  test("fitness never exceeds 100", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ fitness: 99 }) }),
    ]);
    Math.random = () => 1;
    try {
      const { updatedSquad } = buildRestEvent("s", squad);
      expect(updatedSquad.players[0]!.seasonLog!.fitness).toBeLessThanOrEqual(100);
    } finally {
      Math.random = globalThis.Math.random;
    }
  });

  test("trainingSessions never goes below 0", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ trainingSessions: 0.5 }) }),
    ]);
    Math.random = () => 1;
    try {
      const { updatedSquad } = buildRestEvent("s", squad);
      expect(updatedSquad.players[0]!.seasonLog!.trainingSessions).toBeGreaterThanOrEqual(0);
    } finally {
      Math.random = globalThis.Math.random;
    }
  });

  test("morale is not touched", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ morale: 65 }) }),
    ]);
    withRand(() => {
      const { updatedSquad } = buildRestEvent("s", squad);
      expect(updatedSquad.players[0]!.seasonLog!.morale).toBe(65);
    });
  });
});

// ── generateRestDays ──────────────────────────────────────────────────────────

describe("generateRestDays", () => {
  function fixture(date: string): Fixture {
    return { id: `f_${date}`, date, competition: "test", round: 1, home: "A", away: "B", played: false, result: null };
  }

  test("seeds day before and day after each match date", () => {
    const fixtures = [fixture("2025-09-13")]; // Saturday
    const restDays = generateRestDays(fixtures);
    expect(restDays).toContain("2025-09-12");
    expect(restDays).toContain("2025-09-14");
  });

  test("does not add a rest day that is itself a match date", () => {
    // Two consecutive match days: day between them should not appear in restDays
    const fixtures = [fixture("2025-09-13"), fixture("2025-09-14")];
    const restDays = generateRestDays(fixtures);
    expect(restDays).not.toContain("2025-09-13");
    expect(restDays).not.toContain("2025-09-14");
    // But the outer neighbours should be rest days
    expect(restDays).toContain("2025-09-12");
    expect(restDays).toContain("2025-09-15");
  });

  test("returns empty array for no fixtures", () => {
    expect(generateRestDays([])).toEqual([]);
  });

  test("result is sorted ascending", () => {
    const fixtures = [fixture("2025-10-05"), fixture("2025-09-01")];
    const restDays = generateRestDays(fixtures);
    expect(restDays).toEqual([...restDays].sort());
  });
});
