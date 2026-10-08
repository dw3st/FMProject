import { describe, expect, test } from "bun:test";
import {
  buildRestEvent,
  MAX_POINTS_LOST_PER_REST,
  rollRestOutcome,
} from "@/Domain/advanceDay/dailyRest";
import { decayLoad, recoverDay } from "@/Domain/fitness/fitness";
import { generateRestDays } from "@/Domain/season/generateRestDays";
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
  test("fitnessDelta matches recoverDay(fitness, {age, load, stamina}) minus fitness", () => {
    const next = recoverDay(70, { age: 22, load: 0, stamina: 7 });
    const { fitnessDelta } = rollRestOutcome(22, 70, 0, 7, () => 0.5);
    expect(fitnessDelta).toBe(+(next - 70).toFixed(1));
  });

  test("rand=0.5 → expected points loss (fitness recovery no longer uses rand)", () => {
    const { pointsDelta } = rollRestOutcome(22, 70, 0, 7, () => 0.5);
    // pointsLost = 0.5 * 2 = 1.0 → pointsDelta = -1.0
    expect(pointsDelta).toBe(-1.0);
  });

  test("deterministic given the same inputs (fitness recovery has no randomness)", () => {
    const a = rollRestOutcome(22, 70, 0, 7, () => 0.5);
    const b = rollRestOutcome(22, 70, 0, 7, () => 0.5);
    expect(a.fitnessDelta).toBe(b.fitnessDelta);
  });

  test("younger player recovers more fitness than older (same rest inputs)", () => {
    const young = rollRestOutcome(22, 55, 0, 7);
    const old   = rollRestOutcome(35, 55, 0, 7);
    expect(young.fitnessDelta).toBeGreaterThan(old.fitnessDelta);
  });

  test("high load slows recovery relative to no load", () => {
    const noLoad = rollRestOutcome(26, 55, 0, 7);
    const highLoad = rollRestOutcome(26, 55, 220, 7); // FITNESS.LOAD_HIGH
    expect(highLoad.fitnessDelta).toBeLessThan(noLoad.fitnessDelta);
  });

  test("fitnessDelta is always > 0 below 100 fitness", () => {
    for (const age of [18, 25, 30, 35, 40]) {
      const { fitnessDelta } = rollRestOutcome(age, 50, 0, 7, () => 0);
      expect(fitnessDelta).toBeGreaterThan(0);
    }
  });

  test("pointsDelta is always ≤ 0", () => {
    for (const r of [0, 0.5, 1]) {
      const { pointsDelta } = rollRestOutcome(22, 70, 0, 7, () => r);
      expect(pointsDelta).toBeLessThanOrEqual(0);
    }
  });

  test("pointsDelta magnitude never exceeds MAX_POINTS_LOST_PER_REST", () => {
    const { pointsDelta } = rollRestOutcome(22, 70, 0, 7, () => 1);
    expect(Math.abs(pointsDelta)).toBeLessThanOrEqual(MAX_POINTS_LOST_PER_REST);
  });

  test("uses exactly one random draw (points lost only)", () => {
    let calls = 0;
    rollRestOutcome(25, 70, 0, 7, () => { calls++; return 0.5; });
    expect(calls).toBe(1);
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
      const { event } = buildRestEvent("s", squad, "2027-02-05");
      expect(event.kind).toBe("rest");
      expect(event.effects).toHaveLength(2);
    });
  });

  test("fitness increases and trainingSessions decrease", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ fitness: 70, trainingSessions: 3 }) }),
    ]);

    withRand(() => {
      const { updatedSquad } = buildRestEvent("s", squad, "2027-02-05");
      const p1 = updatedSquad.players[0]!;
      expect(p1.seasonLog!.fitness).toBeGreaterThan(70);
      expect(p1.seasonLog!.trainingSessions).toBeLessThan(3);
    });
  });

  test("fitness never exceeds 100", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ fitness: 99 }) }),
    ]);
    const realRandom = Math.random;
    Math.random = () => 1;
    try {
      const { updatedSquad } = buildRestEvent("s", squad, "2027-02-05");
      expect(updatedSquad.players[0]!.seasonLog!.fitness).toBeLessThanOrEqual(100);
    } finally {
      Math.random = realRandom;
    }
  });

  test("trainingSessions never goes below 0", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ trainingSessions: 0.5 }) }),
    ]);
    const realRandom = Math.random;
    Math.random = () => 1;
    try {
      const { updatedSquad } = buildRestEvent("s", squad, "2027-02-05");
      expect(updatedSquad.players[0]!.seasonLog!.trainingSessions).toBeGreaterThanOrEqual(0);
    } finally {
      Math.random = realRandom;
    }
  });

  test("morale is not touched", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ morale: 65 }) }),
    ]);
    withRand(() => {
      const { updatedSquad } = buildRestEvent("s", squad, "2027-02-05");
      expect(updatedSquad.players[0]!.seasonLog!.morale).toBe(65);
    });
  });

  test("load decays by one day's half-life on a rest day", () => {
    const squad = baseSquad([
      basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ load: 100 }) }),
    ]);
    withRand(() => {
      const { updatedSquad } = buildRestEvent("s", squad, "2027-02-05");
      expect(updatedSquad.players[0]!.seasonLog!.load).toBe(decayLoad(100));
    });
  });

  test("missing load is treated as 0 and stays 0 after decay", () => {
    const squad = baseSquad([basePlayer({ id: "p1", name: "One" })]);
    withRand(() => {
      const { updatedSquad } = buildRestEvent("s", squad, "2027-02-05");
      expect(updatedSquad.players[0]!.seasonLog!.load).toBe(0);
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

// ── injuries (Task 3, docs/superpowers/archive/2026-09-28-injuries.md) ───────────

describe("buildRestEvent — injuries", () => {
  test("clears a healed injury (returnDate reached) and reports it in healedPlayerIds", () => {
    const squad = baseSquad([
      basePlayer({
        id: "p1", name: "Healed",
        seasonLog: makeSeasonLog({ fitness: 20 }),
        injury: { severity: "light", returnDate: "2027-03-10" },
      }),
    ]);
    const { updatedSquad, healedPlayerIds } = buildRestEvent("s", squad, "2027-03-10");
    expect(updatedSquad.players[0]!.injury).toBeUndefined();
    expect(healedPlayerIds).toEqual(["p1"]);
  });

  test("keeps a still-injured player's injury and does not report them as healed", () => {
    const squad = baseSquad([
      basePlayer({
        id: "p1", name: "Hurt",
        seasonLog: makeSeasonLog({ fitness: 70 }),
        injury: { severity: "severe", returnDate: "2027-06-01" },
      }),
    ]);
    const { updatedSquad, healedPlayerIds } = buildRestEvent("s", squad, "2027-03-10");
    expect(updatedSquad.players[0]!.injury).toEqual({ severity: "severe", returnDate: "2027-06-01" });
    expect(healedPlayerIds).toEqual([]);
  });
});
