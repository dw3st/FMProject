import { describe, expect, test } from "bun:test";
import {
  buildTrainingEvent,
  MAX_TRAINING_POINTS,
  resolveTrainingPolicy,
  rollTrainingOutcome,
} from "@/Domain/advanceDay/dailyTraining";
import {
  DEFAULT_MIN_ENERGY_TO_TRAIN,
  DEFAULT_TRAINING_INTENSITY,
  GOALKEEPER_TRAINING_FATIGUE_MULTIPLIER,
} from "@/types/developmentTypes";
import { Player } from "@/Domain/Player";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function makeSeasonLog(overrides: Partial<RosterPlayer["seasonLog"]> = {}): NonNullable<RosterPlayer["seasonLog"]> {
  return {
    appearances: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    passesCompleted: 0,
    passesAttempted: 0,
    tackles: 0,
    interceptions: 0,
    avgRating: 0,
    recentRatings: [],
    trainingSessions: 0,
    fitness: 70,
    morale: 70,
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

// ── rollTrainingOutcome ───────────────────────────────────────────────────────

describe("rollTrainingOutcome", () => {
  test("normal, age 22, rand=0.5 → expected points and fitness cost", () => {
    const rand = () => 0.5;
    const { trainingPoints, fitnessDelta } = rollTrainingOutcome("normal", 22, rand);
    // points: 1 + 0.5*(2-1) = 1.50
    expect(trainingPoints).toBe(1.50);
    // cost: (4 + 0.5*4) * 0.8 = 6 * 0.8 = 4.8 → delta -4.8
    expect(fitnessDelta).toBe(-4.8);
  });

  /** Training fatigue only. Rest-day recovery (`dailyRest.rollRestOutcome`) does not halve GK recovery. */
  test("goalkeeper takes half the fitness loss (training points unchanged)", () => {
    const rand = () => 0.5;
    const outfield = rollTrainingOutcome("normal", 22, rand, false);
    const gk = rollTrainingOutcome("normal", 22, rand, true);
    expect(outfield.trainingPoints).toBe(gk.trainingPoints);
    expect(gk.fitnessDelta).toBe(+(outfield.fitnessDelta * GOALKEEPER_TRAINING_FATIGUE_MULTIPLIER).toFixed(1));
    expect(gk.fitnessDelta).toBe(-2.4);
  });

  test("light, age 22, rand=0.5 → lower points and lower cost", () => {
    const rand = () => 0.5;
    const { trainingPoints, fitnessDelta } = rollTrainingOutcome("light", 22, rand);
    // points: 0 + 0.5*1 = 0.50
    expect(trainingPoints).toBe(0.50);
    // cost: (2 + 0.5*3) * 0.8 = 3.5 * 0.8 = 2.8 → delta -2.8
    expect(fitnessDelta).toBe(-2.8);
  });

  test("heavy, age 35, rand=0.5 → higher points, older age multiplier", () => {
    const rand = () => 0.5;
    const { trainingPoints, fitnessDelta } = rollTrainingOutcome("heavy", 35, rand);
    // points: 2 + 0.5*2 = 3.00
    expect(trainingPoints).toBe(3.00);
    // cost: (7 + 0.5*6) * 1.5 = 10 * 1.5 = 15.0 → delta -15.0
    expect(fitnessDelta).toBe(-15.0);
  });

  test("uses exactly two random draws (points then cost)", () => {
    let calls = 0;
    const rand = () => { calls++; return 0.5; };
    rollTrainingOutcome("normal", 25, rand);
    expect(calls).toBe(2);
  });

  test("fitnessDelta is always ≤ 0", () => {
    const rand = () => 1;
    for (const intensity of ["light", "normal", "heavy"] as const) {
      const { fitnessDelta } = rollTrainingOutcome(intensity, 22, rand);
      expect(fitnessDelta).toBeLessThanOrEqual(0);
    }
  });

  test("heavier intensity yields more points than lighter", () => {
    const rand = () => 0.5;
    const light  = rollTrainingOutcome("light",  22, rand);
    const normal = rollTrainingOutcome("normal", 22, rand);
    const heavy  = rollTrainingOutcome("heavy",  22, rand);
    expect(heavy.trainingPoints).toBeGreaterThan(normal.trainingPoints);
    expect(normal.trainingPoints).toBeGreaterThan(light.trainingPoints);
  });

  test("older player pays more fitness than younger with same intensity", () => {
    const rand = () => 0.5;
    const young = rollTrainingOutcome("normal", 20, rand);
    const old   = rollTrainingOutcome("normal", 33, rand);
    expect(old.fitnessDelta).toBeLessThan(young.fitnessDelta);
  });
});

// ── trainingToStatus ──────────────────────────────────────────────────────────

describe("Player.trainingToStatus", () => {
  test("0 points → level 1 (untrained)", () => {
    expect(Player.trainingToStatus(0)).toBe(1);
  });
  test("light band (0–1] → level 2", () => {
    expect(Player.trainingToStatus(0.5)).toBe(2);
    expect(Player.trainingToStatus(1)).toBe(2);
  });
  test("normal band (1–2] → level 3", () => {
    expect(Player.trainingToStatus(1.5)).toBe(3);
    expect(Player.trainingToStatus(2)).toBe(3);
  });
  test("heavy band (2–4] → level 4", () => {
    expect(Player.trainingToStatus(3)).toBe(4);
    expect(Player.trainingToStatus(4)).toBe(4);
  });
  test("above 4 → level 5 (peak)", () => {
    expect(Player.trainingToStatus(4.5)).toBe(5);
    expect(Player.trainingToStatus(5)).toBe(5);
  });
});

// ── resolveTrainingPolicy ─────────────────────────────────────────────────────

describe("resolveTrainingPolicy", () => {
  test("uses defaults when the squad is not the user club", () => {
    const policy = resolveTrainingPolicy(
      { clubId: "user_fc", min_energy_to_train: 40, training_intensity: "heavy" },
      "other_fc",
    );
    expect(policy.minEnergyToTrain).toBe(DEFAULT_MIN_ENERGY_TO_TRAIN);
    expect(policy.intensity).toBe(DEFAULT_TRAINING_INTENSITY);
  });

  test("uses save meta when the squad is the user club", () => {
    const policy = resolveTrainingPolicy(
      { clubId: "user_fc", min_energy_to_train: 40, training_intensity: "heavy" },
      "user_fc",
    );
    expect(policy.minEnergyToTrain).toBe(40);
    expect(policy.intensity).toBe("heavy");
  });

  test("falls back to defaults for optional meta fields on the user club", () => {
    const policy = resolveTrainingPolicy({ clubId: "user_fc" }, "user_fc");
    expect(policy.minEnergyToTrain).toBe(DEFAULT_MIN_ENERGY_TO_TRAIN);
    expect(policy.intensity).toBe(DEFAULT_TRAINING_INTENSITY);
  });

  test("recognises user club when meta.clubId is numeric squadId (not resolved slug)", () => {
    const policy = resolveTrainingPolicy(
      { clubId: "124", min_energy_to_train: 85, training_intensity: "heavy" },
      "fluminense",
      "124",
    );
    expect(policy.minEnergyToTrain).toBe(85);
    expect(policy.intensity).toBe("heavy");
  });
});

// ── buildTrainingEvent ────────────────────────────────────────────────────────

describe("buildTrainingEvent", () => {
  const FIXED_RAND = () => 0.5;

  // Patch Math.random inline via the rand override on rollTrainingOutcome —
  // but buildTrainingEvent uses Math.random directly, so we patch it globally.
  function withRand(fn: () => void) {
    const orig = Math.random;
    Math.random = FIXED_RAND;
    try { fn(); } finally { Math.random = orig; }
  }

  test("only eligible players (fitness ≥ threshold) are trained", () => {
    const squad: Squad = {
      id: "s", name: "T", colors: ["#000", "#fff"], money: 0,
      players: [
        basePlayer({ id: "p1", name: "One" }),
        basePlayer({ id: "p2", name: "Low", seasonLog: makeSeasonLog({ fitness: 50 }) }),
      ],
    };

    withRand(() => {
      const { event, updatedSquad } = buildTrainingEvent("s", squad, {
        minEnergyToTrain: 60,
        intensity: "normal",
      });

      expect(event.effects).toHaveLength(2); // all players get an effect entry now
      expect(event.effects[0]!.playerId).toBe("p1");

      const p1 = updatedSquad.players.find((p) => p.id === "p1");
      const p2 = updatedSquad.players.find((p) => p.id === "p2");

      // p1 trains: points + fitnessDelta applied, morale unchanged
      expect(p1?.seasonLog?.trainingSessions).toBe(1.50);
      expect(p1?.seasonLog?.fitness).toBe(65.2); // 70 + (-4.8)
      expect(p1?.seasonLog?.morale).toBe(70);    // morale not touched

      // p2 gets partial rest recovery (40%), not full training
      expect(p2?.seasonLog?.trainingSessions).toBe(0);
      expect(p2?.seasonLog?.fitness).toBeGreaterThanOrEqual(50); // recovered slightly
    });
  });

  test("training points are capped at MAX_TRAINING_POINTS (5)", () => {
    const squad: Squad = {
      id: "s", name: "T", colors: ["#000", "#fff"], money: 0,
      players: [
        basePlayer({ id: "p1", name: "One", seasonLog: makeSeasonLog({ trainingSessions: 4.8 }) }),
      ],
    };

    withRand(() => {
      const { updatedSquad } = buildTrainingEvent("s", squad, {
        minEnergyToTrain: 60,
        intensity: "heavy",
      });
      const p1 = updatedSquad.players.find((p) => p.id === "p1");
      expect(p1?.seasonLog?.trainingSessions).toBe(MAX_TRAINING_POINTS);
    });
  });

  test("every eligible player trains (no squad-size cap)", () => {
    const players: RosterPlayer[] = Array.from({ length: 14 }, (_, i) =>
      basePlayer({ id: `p${i}`, name: `Player ${i}` }),
    );
    const squad: Squad = {
      id: "s", name: "Big Squad", colors: ["#000", "#fff"], money: 0, players,
    };

    withRand(() => {
      const { event, updatedSquad } = buildTrainingEvent("s", squad, {
        minEnergyToTrain: 60,
        intensity: "normal",
      });

      expect(event.effects).toHaveLength(14);
      for (const p of updatedSquad.players) {
        expect((p.seasonLog?.trainingSessions ?? 0)).toBeGreaterThan(0);
      }
    });
  });

  test("fitness never goes below 0", () => {
    const squad: Squad = {
      id: "s", name: "T", colors: ["#000", "#fff"], money: 0,
      players: [basePlayer({ id: "p1", name: "One", age: 40, seasonLog: makeSeasonLog({ fitness: 60 }) })],
    };

    Math.random = () => 1;
    try {
      const { updatedSquad } = buildTrainingEvent("s", squad, {
        minEnergyToTrain: 60,
        intensity: "heavy",
      });
      expect(updatedSquad.players[0]?.seasonLog?.fitness).toBeGreaterThanOrEqual(0);
    } finally {
      Math.random = globalThis.Math.random;
    }
  });
});
